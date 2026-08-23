import { OwlService, parseMasterKey } from "@owl-memory/core";
import { createDatabaseClient, PostgresStore } from "@owl-memory/db";

class WorkerEmbeddingClient {
  constructor(private readonly baseUrl: string) {}

  embedQuery(value: string) {
    return this.embed("query", [value]).then((rows) => rows[0] ?? []);
  }

  embedPassages(values: string[]) {
    return this.embed("passage", values);
  }

  async healthy() {
    try {
      return (await fetch(`${this.baseUrl}/healthz`)).ok;
    } catch {
      return false;
    }
  }

  private async embed(kind: "query" | "passage", texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embedding service returned ${response.status}`);
    return ((await response.json()) as { vectors: number[][] }).vectors;
  }
}

const databaseUrl = required("OWL_DATABASE_URL");
const embeddingsUrl = process.env.OWL_EMBEDDINGS_URL ?? "http://localhost:8790";
const database = createDatabaseClient(databaseUrl, 4);
const store = new PostgresStore(database);
const embeddings = new WorkerEmbeddingClient(embeddingsUrl);
const service = new OwlService(store, embeddings, parseMasterKey(required("OWL_MASTER_KEY")));
const intervalMs = Number(process.env.OWL_MAINTENANCE_INTERVAL_MS ?? 60 * 60 * 1000);

async function runPass() {
  const started = Date.now();
  const brains = await database.sql<Array<{ brain_id: string; owner_id: string }>>`
    SELECT * FROM owl_worker_brains()
  `;
  for (const brain of brains) {
    const actor = await store.loadActor(brain.owner_id, "owl-worker");
    await service.scanMaintenance(brain.brain_id, actor);
  }
  const missing = await database.sql<Array<{ article_id: string; owner_id: string }>>`
    SELECT * FROM owl_worker_unindexed_articles(100)
  `;
  for (const article of missing) {
    try {
      const actor = await store.loadActor(article.owner_id, "owl-worker");
      await service.reindexArticle(article.article_id, actor);
    } catch (error) {
      process.stderr.write(`Indexing ${article.article_id} failed: ${(error as Error).message}\n`);
    }
  }
  process.stdout.write(
    `${new Date().toISOString()} maintenance pass: ${brains.length} brains, ${missing.length} index candidates, ${Date.now() - started}ms\n`,
  );
}

let stopping = false;
const stop = async () => {
  stopping = true;
  await database.close();
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

while (!stopping) {
  try {
    await runPass();
  } catch (error) {
    process.stderr.write(`Maintenance pass failed: ${(error as Error).stack ?? error}\n`);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
