import { accessSync, constants, mkdirSync } from "node:fs";
import type { DataType } from "@huggingface/transformers";

// The cache directory is normally a Docker volume, and an empty volume is created root-owned
// unless the image seeds it. The unprivileged user then fails the model download deep inside the
// pipeline with EACCES, which surfaces only as a healthcheck that never turns green. Failing at
// startup instead names the real problem in one line.
export function assertModelCacheWritable(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    // W_OK alone passes on a directory the loader cannot traverse into; X_OK is search permission.
    accessSync(dir, constants.W_OK | constants.X_OK);
  } catch (error) {
    const uid = process.getuid?.() ?? "unknown";
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Model cache ${dir} is not writable by uid ${uid}: ${reason}`);
  }
}

export type Extractor = (
  texts: string[],
  options: { pooling: "cls" | "mean"; normalize: true },
) => Promise<{ tolist(): unknown }>;

export const embeddingDimensions = 384;

export type ModelSpec = {
  pooling: "cls" | "mean";
  queryPrefix: string;
  passagePrefix: string;
  dtype: DataType;
};

// Mirrors DATA_TYPES in @huggingface/transformers; `satisfies` fails the build if the library
// drops one, so a value accepted here is always a value the pipeline accepts.
const DTYPES = [
  "auto",
  "fp32",
  "fp16",
  "q8",
  "int8",
  "uint8",
  "q4",
  "bnb4",
  "q4f16",
] as const satisfies readonly DataType[];

function isDataType(value: string): value is DataType {
  return (DTYPES as readonly string[]).includes(value);
}

// Pooling, prefixes, and dtype are properties of how a model was trained, not preferences.
// CLS-pooling a mean-pooled model, or dropping the "query: " marker an e5 model was trained
// with, silently degrades every vector it produces. Known families get their trained
// configuration; anything unrecognized keeps the e5-style behaviour this service always had,
// and each field can be overridden through the environment for models not listed here.
const KNOWN_FAMILIES: Array<{ match: RegExp; spec: ModelSpec }> = [
  {
    match: /granite-embedding/i,
    spec: { pooling: "cls", queryPrefix: "", passagePrefix: "", dtype: "q8" },
  },
  {
    match: /-e5-|\be5\b/i,
    spec: { pooling: "mean", queryPrefix: "query: ", passagePrefix: "passage: ", dtype: "fp32" },
  },
];

const FALLBACK_SPEC: ModelSpec = {
  pooling: "mean",
  queryPrefix: "query: ",
  passagePrefix: "passage: ",
  dtype: "fp32",
};

// Compose passes optional variables through as empty strings, so empty means unset.
function override(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

export function resolveModelSpec(
  model: string,
  env: Record<string, string | undefined>,
): ModelSpec {
  const base = KNOWN_FAMILIES.find((family) => family.match.test(model))?.spec ?? FALLBACK_SPEC;
  const pooling = override(env.REMENTUM_EMBEDDING_POOLING) ?? base.pooling;
  if (pooling !== "cls" && pooling !== "mean") {
    throw new Error(`REMENTUM_EMBEDDING_POOLING must be "cls" or "mean", received "${pooling}"`);
  }
  const dtype = override(env.REMENTUM_EMBEDDING_DTYPE) ?? base.dtype;
  if (!isDataType(dtype)) {
    throw new Error(
      `REMENTUM_EMBEDDING_DTYPE must be one of ${DTYPES.join(", ")}, received "${dtype}"`,
    );
  }
  return {
    pooling,
    queryPrefix: override(env.REMENTUM_EMBEDDING_QUERY_PREFIX) ?? base.queryPrefix,
    passagePrefix: override(env.REMENTUM_EMBEDDING_PASSAGE_PREFIX) ?? base.passagePrefix,
    dtype,
  };
}

// Pooling and the prefixes define the vector space: change either and every stored vector stops
// being comparable with new ones, exactly as if the model itself had changed. So when an override
// moves a model off its family defaults, the identity stored next to each vector moves too —
// search then refuses to mix the spaces and the worker's unindexed pass re-embeds the corpus,
// the same self-healing a model switch gets. dtype stays out on purpose: quantization perturbs
// vectors inside the same space rather than replacing it, and forcing a corpus re-embed over a
// precision change would be waste.
export function embeddingSpaceId(model: string, spec: ModelSpec): string {
  const defaults = resolveModelSpec(model, {});
  const drift = [
    spec.pooling !== defaults.pooling ? `pooling=${spec.pooling}` : null,
    spec.queryPrefix !== defaults.queryPrefix ? `query=${spec.queryPrefix}` : null,
    spec.passagePrefix !== defaults.passagePrefix ? `passage=${spec.passagePrefix}` : null,
  ].filter((part) => part !== null);
  return drift.length > 0 ? `${model}#${drift.join(";")}` : model;
}

export type Embedder = {
  ready(): boolean;
  load(): Promise<Extractor>;
  embed(kind: "query" | "passage", texts: string[]): Promise<number[][]>;
};

export function createEmbedder(
  model: string,
  spec: ModelSpec,
  load: (model: string) => Promise<Extractor>,
): Embedder {
  let pending: Promise<Extractor> | null = null;
  let ready = false;

  function loadOnce(): Promise<Extractor> {
    // A rejected promise left in this slot would fail every later call for the life of the
    // process, so a failed load clears it and the next caller — usually the healthcheck —
    // retries. Without that, one unreachable download is indistinguishable from a broken model.
    pending ??= load(model).then(
      (extractor) => {
        ready = true;
        return extractor;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  }

  return {
    ready: () => ready,
    load: loadOnce,
    async embed(kind, texts) {
      const prefix = kind === "query" ? spec.queryPrefix : spec.passagePrefix;
      const extractor = await loadOnce();
      const output = await extractor(
        texts.map((text) => `${prefix}${text}`),
        { pooling: spec.pooling, normalize: true },
      );
      const vectors = output.tolist() as number[][];
      if (vectors.some((vector) => vector.length !== embeddingDimensions)) {
        throw new Error(
          `Embedding model ${model} did not produce ${embeddingDimensions} dimensions`,
        );
      }
      return vectors;
    },
  };
}
