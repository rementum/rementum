import { env, pipeline } from "@huggingface/transformers";
import Fastify from "fastify";
import { z } from "zod";

const model = process.env.REMENTUM_EMBEDDING_MODEL ?? "intfloat/multilingual-e5-small";
const cacheDir = process.env.REMENTUM_MODEL_CACHE;
if (cacheDir) env.cacheDir = cacheDir;
env.allowRemoteModels = process.env.REMENTUM_EMBEDDING_OFFLINE !== "true";

const app = Fastify({ logger: true, bodyLimit: 2_000_000 });
type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): unknown }>;

let extractorPromise: Promise<Extractor> | null = null;

const requestSchema = z.object({
  kind: z.enum(["query", "passage"]),
  texts: z.array(z.string().min(1).max(20_000)).min(1).max(64),
});

function extractor(): Promise<Extractor> {
  extractorPromise ??= (
    pipeline as unknown as (
      task: string,
      modelName: string,
      options: { dtype: string },
    ) => Promise<Extractor>
  )("feature-extraction", model, { dtype: "fp32" });
  return extractorPromise;
}

app.get("/healthz", async (_request, reply) => {
  reply.send({ ok: true, model, loaded: extractorPromise !== null });
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
  const prefix = parsed.data.kind === "query" ? "query: " : "passage: ";
  const output = await (await extractor())(
    parsed.data.texts.map((text) => `${prefix}${text}`),
    { pooling: "mean", normalize: true },
  );
  const nested = output.tolist() as number[][];
  if (nested.some((vector) => vector.length !== 384)) {
    throw new Error(`Embedding model ${model} did not produce 384 dimensions`);
  }
  return reply.send({ model, dimensions: 384, vectors: nested });
});

const port = Number(process.env.PORT ?? 8790);
await app.listen({ host: "0.0.0.0", port });
