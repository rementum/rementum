import { env, pipeline } from "@huggingface/transformers";
import Fastify from "fastify";
import { z } from "zod";
import {
  assertModelCacheWritable,
  createEmbedder,
  type Extractor,
  embeddingDimensions,
} from "./embedder.js";

const model = process.env.REMENTUM_EMBEDDING_MODEL ?? "intfloat/multilingual-e5-small";
const cacheDir = process.env.REMENTUM_MODEL_CACHE;
if (cacheDir) {
  env.cacheDir = cacheDir;
  assertModelCacheWritable(cacheDir);
}
env.allowRemoteModels = process.env.REMENTUM_EMBEDDING_OFFLINE !== "true";

const app = Fastify({ logger: true, bodyLimit: 2_000_000 });

const requestSchema = z.object({
  kind: z.enum(["query", "passage"]),
  texts: z.array(z.string().min(1).max(20_000)).min(1).max(64),
});

const embedder = createEmbedder(model, (name) =>
  (
    pipeline as unknown as (
      task: string,
      modelName: string,
      options: { dtype: string },
    ) => Promise<Extractor>
  )("feature-extraction", name, { dtype: "fp32" }),
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
      model,
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return reply.send({ ok: true, model, loaded: embedder.ready() });
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
  return reply.send({ model, dimensions: embeddingDimensions, vectors });
});

const port = Number(process.env.PORT ?? 8790);
await app.listen({ host: "0.0.0.0", port });
