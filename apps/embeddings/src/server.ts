import {
  type DataType,
  env,
  type FeatureExtractionPipeline,
  pipeline,
} from "@huggingface/transformers";
import Fastify from "fastify";
import { z } from "zod";
import {
  assertModelCacheWritable,
  createEmbedder,
  embeddingDimensions,
  embeddingSpaceId,
  MAX_TEXTS_PER_REQUEST,
  resolveModelSpec,
} from "./embedder.js";

const model =
  process.env.REMENTUM_EMBEDDING_MODEL ||
  "onnx-community/granite-embedding-97m-multilingual-r2-ONNX";
const spec = resolveModelSpec(model, process.env);
// What every response reports as `model`: overrides that change the vector space change this
// identity, which is what search filters on and what the worker re-embeds against.
const spaceId = embeddingSpaceId(model, spec);
const cacheDir = process.env.REMENTUM_MODEL_CACHE;
if (cacheDir) {
  env.cacheDir = cacheDir;
  assertModelCacheWritable(cacheDir);
}
env.allowRemoteModels = process.env.REMENTUM_EMBEDDING_OFFLINE !== "true";

const app = Fastify({ logger: true, bodyLimit: 2_000_000 });

const requestSchema = z.object({
  kind: z.enum(["query", "passage"]),
  texts: z.array(z.string().min(1).max(20_000)).min(1).max(MAX_TEXTS_PER_REQUEST),
});

// Calling the generic pipeline() overload directly trips TS2590 (the AllTasks union is too
// complex for the checker), so the cast pins the one instantiation this service uses — the
// task literal, the library's own DataType, and its FeatureExtractionPipeline return type.
const loadPipeline = pipeline as unknown as (
  task: "feature-extraction",
  modelName: string,
  options: { dtype: DataType },
) => Promise<FeatureExtractionPipeline>;

const embedder = createEmbedder(model, spec, (name) =>
  loadPipeline("feature-extraction", name, { dtype: spec.dtype }),
);

app.get("/healthz", async (request, reply) => {
  try {
    // The probe loads the model rather than reporting on the process alone. Answering `ok`
    // before the model works let the whole stack come up green around an embedder that could
    // not serve a single request, and every indexing failure downstream is swallowed, so
    // nothing else would have reported it.
    await embedder.load();
  } catch (error) {
    request.log.error(error, "Embedding model failed to load");
    return reply.code(503).send({
      ok: false,
      model: spaceId,
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return reply.send({ ok: true, model: spaceId, loaded: embedder.ready() });
});

app.post("/embed", async (request, reply) => {
  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      type: "urn:rementum:problem:validation",
      title: "Invalid embedding request",
      status: 400,
      issues: parsed.error.issues,
    });
  }
  const vectors = await embedder.embed(parsed.data.kind, parsed.data.texts);
  return reply.send({ model: spaceId, dimensions: embeddingDimensions, vectors });
});

const port = Number(process.env.PORT ?? 8790);
await app.listen({ host: "0.0.0.0", port });
