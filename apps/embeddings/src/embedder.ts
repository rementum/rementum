import { accessSync, constants, mkdirSync } from "node:fs";

// The cache directory is normally a Docker volume, and an empty volume is created root-owned
// unless the image seeds it. The unprivileged user then fails the model download deep inside the
// pipeline with EACCES, which surfaces only as a healthcheck that never turns green. Failing at
// startup instead names the real problem in one line.
export function assertModelCacheWritable(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch (error) {
    const uid = process.getuid?.() ?? "unknown";
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Model cache ${dir} is not writable by uid ${uid}: ${reason}`);
  }
}

export type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): unknown }>;

export const embeddingDimensions = 384;

export type Embedder = {
  ready(): boolean;
  load(): Promise<Extractor>;
  embed(kind: "query" | "passage", texts: string[]): Promise<number[][]>;
};

export function createEmbedder(
  model: string,
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
      const prefix = kind === "query" ? "query: " : "passage: ";
      const extractor = await loadOnce();
      const output = await extractor(
        texts.map((text) => `${prefix}${text}`),
        { pooling: "mean", normalize: true },
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
