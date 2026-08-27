import { randomUUID } from "node:crypto";
import type { Actor } from "@rementum/core";
import { OpenAICompatibleArticleGenerator, parseMasterKey, RementumService } from "@rementum/core";
import { createDatabaseClient, PostgresStore } from "@rementum/db";

class WorkerEmbeddingClient {
  constructor(private readonly baseUrl: string) {}

  embedQuery(value: string) {
    return this.embed("query", [value]).then(({ model, vectors }) => ({
      model,
      vector: vectors[0] ?? [],
    }));
  }

  embedPassages(values: string[]) {
    return this.embed("passage", values);
  }

  // /healthz blocks on the model load, which can run for minutes on a cold cache. A probe that
  // times out during that window reads as "not up yet", which every caller already treats as
  // retry-next-pass — while an unbounded probe would hang the maintenance loop itself.
  async healthy() {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** The active model, or null while the service is unreachable or still loading. */
  async activeModel(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return null;
      return ((await response.json()) as { model: string }).model;
    } catch {
      return null;
    }
  }

  private async embed(
    kind: "query" | "passage",
    texts: string[],
  ): Promise<{ model: string; vectors: number[][] }> {
    const response = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embedding service returned ${response.status}`);
    return (await response.json()) as { model: string; vectors: number[][] };
  }
}

const databaseUrl = required("REMENTUM_DATABASE_URL");
const embeddingsUrl = process.env.REMENTUM_EMBEDDINGS_URL ?? "http://localhost:8790";
const database = createDatabaseClient(databaseUrl, 4);
const store = new PostgresStore(database);
const embeddings = new WorkerEmbeddingClient(embeddingsUrl);
const llmEnabled = process.env.REMENTUM_LLM_ENABLED === "true";
const llmBaseUrl = llmEnabled ? required("REMENTUM_LLM_BASE_URL") : null;
const llmModel = llmEnabled ? required("REMENTUM_LLM_MODEL") : null;
const llmConcurrency = numberEnv("REMENTUM_LLM_CONCURRENCY", 4, 1, 16);
const articleGenerator =
  llmEnabled && llmBaseUrl && llmModel
    ? new OpenAICompatibleArticleGenerator({
        baseUrl: llmBaseUrl,
        model: llmModel,
        ...(process.env.REMENTUM_LLM_API_KEY ? { apiKey: process.env.REMENTUM_LLM_API_KEY } : {}),
        ...(process.env.REMENTUM_LLM_REASONING_EFFORT
          ? { reasoningEffort: process.env.REMENTUM_LLM_REASONING_EFFORT }
          : {}),
        timeoutMs: numberEnv("REMENTUM_LLM_TIMEOUT_MS", 45_000, 1_000, 300_000),
        maxInputChars: numberEnv("REMENTUM_LLM_MAX_INPUT_CHARS", 24_000, 8_000, 200_000),
        concurrency: llmConcurrency,
      })
    : null;
const service = new RementumService(
  store,
  embeddings,
  parseMasterKey(required("REMENTUM_MASTER_KEY")),
  articleGenerator,
  llmEnabled,
);
const intervalMs = Number(process.env.REMENTUM_MAINTENANCE_INTERVAL_MS ?? 60 * 60 * 1000);
const compactionPollMs = numberEnv("REMENTUM_COMPACTION_POLL_MS", 2_000, 250, 60_000);
const workerId = `rementum-worker-${randomUUID()}`;

/**
 * Loads each owner's context at most once every {@link ACTOR_CACHE_MS}.
 *
 * The loops below run over rows, not owners, and a handful of owners usually account for
 * all of them: one hundred unindexed articles meant one hundred identical context loads.
 *
 * A cached context is also a cached authorization: setActorConfig copies its role maps
 * into the session settings row-level security reads, so a role revoked mid-pass stays
 * effective until the entry expires. The window is bounded here rather than left to run
 * for a whole maintenance pass, which is an hour apart by default and has no upper bound
 * on how long it takes. A failed load is never cached, so the next row retries it.
 */
const ACTOR_CACHE_MS = 30_000;

function actorCache() {
  const actors = new Map<string, { loadedAt: number; actor: Promise<Actor> }>();
  return (ownerId: string) => {
    const cached = actors.get(ownerId);
    if (cached && Date.now() - cached.loadedAt < ACTOR_CACHE_MS) return cached.actor;
    const actor = store.loadActor(ownerId, "rementum-worker").catch((error) => {
      actors.delete(ownerId);
      throw error;
    });
    actors.set(ownerId, { loadedAt: Date.now(), actor });
    return actor;
  };
}

async function runPass() {
  const started = Date.now();
  const actorFor = actorCache();
  const brains = await database.sql<Array<{ brain_id: string; owner_id: string }>>`
    SELECT * FROM owl_worker_brains()
  `;
  for (const brain of brains) {
    await service.scanMaintenance(brain.brain_id, await actorFor(brain.owner_id));
  }
  // An article indexed under a different embedding model counts as unindexed, so switching
  // models re-embeds the whole corpus through this same pass. While the embedding service is
  // down or still loading there is no model to compare against, and reindexing would fail
  // anyway, so the pass skips instead of guessing.
  const activeModel = await embeddings.activeModel();
  const missing = activeModel
    ? await database.sql<Array<{ article_id: string; owner_id: string }>>`
        SELECT * FROM owl_worker_unindexed_articles(100, ${activeModel})
      `
    : [];
  for (const article of missing) {
    try {
      await service.reindexArticle(article.article_id, await actorFor(article.owner_id));
    } catch (error) {
      process.stderr.write(`Indexing ${article.article_id} failed: ${(error as Error).message}\n`);
    }
  }
  process.stdout.write(
    `${new Date().toISOString()} maintenance pass: ${brains.length} brains, ${missing.length} index candidates, ${Date.now() - started}ms\n`,
  );
}

async function runCompactionPass() {
  const claims = (
    await Promise.all(
      Array.from({ length: llmConcurrency }, () => store.claimCompaction(workerId, 120)),
    )
  ).filter((claim) => claim !== null);
  const actorFor = actorCache();
  await Promise.all(
    claims.map(async (claim) => {
      const started = Date.now();
      const actor = await actorFor(claim.ownerId);
      try {
        const result = await service.compactClaimedJob(claim, actor);
        if (result) {
          process.stdout.write(
            `${new Date().toISOString()} compacted article ${result.articleId} v${result.version} attempt ${claim.attempts} in ${Date.now() - started}ms\n`,
          );
        }
      } catch (error) {
        await service.failClaimedCompaction(claim, error, actor);
        process.stderr.write(
          `${new Date().toISOString()} compaction ${claim.jobId} attempt ${claim.attempts} failed: ${(error as Error).message}\n`,
        );
      }
    }),
  );
  return claims.length;
}

let stopping = false;
const stop = async () => {
  stopping = true;
  await database.close();
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

let nextMaintenanceAt = 0;
while (!stopping) {
  try {
    if (Date.now() >= nextMaintenanceAt) {
      await runPass();
      nextMaintenanceAt = Date.now() + intervalMs;
    }
    if (articleGenerator) await runCompactionPass();
  } catch (error) {
    process.stderr.write(`Worker pass failed: ${(error as Error).stack ?? error}\n`);
  }
  await new Promise((resolve) =>
    setTimeout(resolve, articleGenerator ? compactionPollMs : intervalMs),
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function numberEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
