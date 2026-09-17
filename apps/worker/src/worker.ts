import type { Actor } from "@rementum/core";
import { parseMasterKey, RementumService } from "@rementum/core";
import { AuthRepository, createDatabaseClient, PostgresStore } from "@rementum/db";

class WorkerEmbeddingClient {
  constructor(private readonly baseUrl: string) {}

  embedQuery(value: string) {
    return this.embed("query", [value]).then(({ model, vectors }) => ({
      model,
      vector: vectors[0] ?? [],
    }));
  }

  embedPassages(values: string[]) {
    if (!values.length) return Promise.resolve({ model: "", vectors: [] });
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
const auth = new AuthRepository(database);
const embeddings = new WorkerEmbeddingClient(embeddingsUrl);
const service = new RementumService(
  store,
  embeddings,
  parseMasterKey(required("REMENTUM_MASTER_KEY")),
);
// An empty or non-numeric value used to become 0 or NaN here: back-to-back passes, or no
// second pass ever and a busy loop in the sleep below.
const intervalMs = numberEnv(
  "REMENTUM_MAINTENANCE_INTERVAL_MS",
  60 * 60 * 1000,
  10_000,
  7 * 24 * 60 * 60 * 1000,
);

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
  // One brain that cannot be scanned must not stop the rest from being scanned, and must
  // not abort the reindex and retry stages that follow.
  for (const brain of brains) {
    try {
      await service.scanMaintenance(brain.brain_id, await actorFor(brain.owner_id));
    } catch (error) {
      process.stderr.write(`Scanning ${brain.brain_id} failed: ${(error as Error).message}\n`);
    }
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
  // Expired OAuth tokens and codes were never removed, so every grant lookup scanned the
  // whole history of the instance.
  let pruned = 0;
  try {
    pruned = await auth.pruneExpiredOauthRecords();
  } catch (error) {
    process.stderr.write(`Pruning OAuth records failed: ${(error as Error).message}\n`);
  }
  process.stdout.write(
    `${new Date().toISOString()} maintenance pass: ${brains.length} brains, ${missing.length} index candidates, ${pruned} OAuth records pruned, ${Date.now() - started}ms\n`,
  );
}

let stopping = false;
let wake: (() => void) | null = null;
// Closing the pool from the signal handler cut queries off mid-pass and left the loop
// asleep for up to an hour before it noticed. The handler now only asks the loop to stop
// and interrupts its sleep; the pool closes once the pass in flight has finished.
const stop = () => {
  stopping = true;
  wake?.();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

let nextMaintenanceAt = 0;
while (!stopping) {
  try {
    if (Date.now() >= nextMaintenanceAt) {
      // Scheduled before the pass runs: a failing pass used to leave the deadline in the
      // past, so the loop retried the whole pass on every poll tick.
      nextMaintenanceAt = Date.now() + intervalMs;
      await runPass();
    }
  } catch (error) {
    process.stderr.write(`Worker pass failed: ${(error as Error).stack ?? error}\n`);
  }
  if (stopping) break;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, intervalMs);
    wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  wake = null;
}
await database.close();

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
