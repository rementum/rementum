/**
 * Measures round trips and wall time for the operations a running instance repeats most.
 *
 * Run against a throwaway migrated database:
 *   REMENTUM_TEST_DATABASE_URL=postgres://owl_app:owl@127.0.0.1:5432/owl pnpm bench
 *
 * Round trips are counted rather than only timed: a local socket hides the latency a
 * managed database charges on every statement, and that is what these changes remove.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { promoteWriteSchema, stageWriteSchema } from "@rementum/contracts";
import {
  decrypt,
  generateDataKey,
  parseMasterKey,
  RementumService,
  unwrapDataKey,
  wrapDataKey,
} from "@rementum/core";
import { AuthRepository, createDatabaseClient, PostgresStore } from "@rementum/db";
import type { Sql } from "postgres";

const url = process.env.REMENTUM_TEST_DATABASE_URL;
if (!url) throw new Error("REMENTUM_TEST_DATABASE_URL is required");

const ARTICLES = Number(process.env.BENCH_ARTICLES ?? 40);
const masterKey = parseMasterKey(Buffer.alloc(32, 7).toString("base64"));

let statements = 0;

function countingClient() {
  const client = createDatabaseClient(url as string);
  const handler: ProxyHandler<Sql> = {
    apply(target, thisArg, args: unknown[]) {
      statements += 1;
      return Reflect.apply(target as never, thisArg, args);
    },
    get(target, property, receiver) {
      if (property === "begin") {
        return (fn: (tx: Sql) => Promise<unknown>) =>
          (target as Sql).begin((tx) => {
            statements += 2; // BEGIN and COMMIT
            return fn(new Proxy(tx, handler) as Sql) as never;
          });
      }
      return Reflect.get(target, property, receiver);
    },
  };
  return { ...client, sql: new Proxy(client.sql, handler) as Sql };
}

async function measure<T>(label: string, run: () => Promise<T>): Promise<T> {
  statements = 0;
  const started = process.hrtime.bigint();
  const result = await run();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const stmts = String(statements).padStart(6);
  console.log(`${label.padEnd(42)} ${stmts} stmts ${ms.toFixed(1).padStart(8)} ms`);
  return result;
}

async function main() {
  const client = countingClient();
  const store = new PostgresStore(client);
  const auth = new AuthRepository(client);
  const suffix = randomUUID().slice(0, 8);

  const owner = await auth.registerAccount(
    `bench-${suffix}@example.test`,
    "Bench owner",
    "password-hash",
    "Bench team",
    `bench-${suffix}`,
  );
  if (!owner) throw new Error("Registration failed");

  const brainId = randomUUID();
  const wrapped = wrapDataKey(generateDataKey(), masterKey, brainId);
  await store.createBrain(
    {
      workspaceId: owner.workspaceId,
      slug: `bench-${suffix}`,
      name: "Bench brain",
      description: "",
      instructions: "",
    } as never,
    await store.loadActor(owner.user.id, "bench"),
    wrapped,
    brainId,
  );
  const actor = await store.loadActor(owner.user.id, "bench");

  const embeddings = {
    embedQuery: async () => null,
    embedDocument: async () => null,
    healthy: async () => false,
  };
  const service = new RementumService(store, embeddings as never, masterKey, null, false);

  // Bodies only reach the database through the staged write path, which is also the
  // binding the bulk export read has to agree with.
  for (let i = 0; i < ARTICLES; i += 1) {
    const write = await service.stageWrite(
      stageWriteSchema.parse({
        brainId,
        operation: "create",
        slug: `article-${String(i).padStart(3, "0")}`,
        title: `Article ${i}`,
        keywords: ["bench"],
        kind: "canonical",
        body: `# Article ${i}\n\n${randomBytes(200).toString("hex")}`,
        changeSummary: "bench",
        acknowledgePotentialConflicts: true,
      }),
      actor,
    );
    await service.promoteWrite(
      promoteWriteSchema.parse({ writeId: write.id, decisionSummary: "bench" }),
      actor,
    );
  }

  // Promotion kicks off embedding indexing without awaiting it. Letting that drain keeps
  // its statements out of the measurements below.
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  console.log(`\n--- one brain, ${ARTICLES} articles ---`);
  console.log("operation                                    stmts     time");

  await measure("loadActor", () => store.loadActor(owner.user.id, "bench"));
  await measure("scopeActorToWorkspace", () =>
    store.scopeActorToWorkspace(actor, owner.workspaceId),
  );
  await measure("getBrain", () => store.getBrain(brainId, actor));
  await measure("listRoutingIndex", () => store.listRoutingIndex(brainId, actor, 10_000));
  await measure("recentActivity", () => store.recentActivity(brainId, actor, 50));
  await measure("listTasks", () => store.listTasks(brainId, actor));

  const index = await store.listRoutingIndex(brainId, actor, 10_000);
  await measure("createTask (2 articles, 4 links)", () =>
    store.createTask(
      {
        brainId,
        title: "Bench task",
        brief: "Bench",
        priority: 1,
        articleIds: index.slice(0, 2).map((article) => article.id),
        links: ["https://a.test", "https://b.test", "https://c.test", "https://d.test"],
      } as never,
      actor,
    ),
  );

  await measure(`export the old way: readArticle x${index.length}`, async () => {
    for (const article of index) await service.readArticle(article.id, actor);
  });
  await measure("export the new way: exportBrain", async () => {
    const exported = await service.exportBrain(brainId, actor);
    if (exported.articles.length !== index.length) throw new Error("export lost articles");
  });

  // The bulk read decrypts with the brain key directly, so check it against the plaintext
  // the per-article path produces.
  const [sample] = await store.listCurrentVersions(brainId, actor, 1);
  if (!sample) throw new Error("no sample version");
  const direct = decrypt(
    sample.body,
    unwrapDataKey(wrapped, masterKey, brainId),
    sample.bodyAad,
  ).toString("utf8");
  const viaService = (await service.readArticle(sample.articleId, actor)).body;
  if (direct !== viaService) throw new Error("bulk read disagrees with readArticle");
  console.log("\nbulk read matches readArticle for the sampled article");

  await client.close();
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
