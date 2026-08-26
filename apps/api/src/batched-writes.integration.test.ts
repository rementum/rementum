import { randomBytes } from "node:crypto";
import { ConflictError } from "@rementum/core";
import { AuthRepository, createDatabaseClient, PostgresStore, setActorConfig } from "@rementum/db";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

async function testConfig(suffix: string) {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return loadConfig({
    NODE_ENV: "test",
    REMENTUM_PUBLIC_URL: "http://rementum.example.test",
    REMENTUM_DATABASE_URL: databaseUrl,
    REMENTUM_MASTER_KEY: Buffer.alloc(32, 9).toString("base64"),
    REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
    REMENTUM_JWT_JWKS: JSON.stringify({
      keys: [{ ...(await exportJWK(privateKey)), use: "sig", alg: "RS256", kid: `test-${suffix}` }],
    }),
    REMENTUM_BLOB_DIR: `/tmp/rementum-${suffix}/blobs`,
    REMENTUM_EXPORT_DIR: `/tmp/rementum-${suffix}/exports`,
    REMENTUM_EMBEDDINGS_URL: "http://127.0.0.1:9",
    REMENTUM_DEV_AUTH: "true",
    REMENTUM_LOG_LEVEL: "silent",
  });
}

// These paths write several rows per call and are batched into one statement each. The
// MCP-only link surface had no coverage against a real database before, so the set
// validation that replaced the per-row lookup is asserted here rather than mocked.
integration("batched multi-row writes", () => {
  it("links, relinks, and refuses to leave the brain", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const app = await buildApp(await testConfig(suffix), { mailer: null });
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);

    try {
      const owner = await auth.registerAccount(
        `links-${suffix}@example.test`,
        "Links owner",
        "owner-password-hash",
        "Links team",
        `links-${suffix}`,
      );
      if (!owner) throw new Error("Registration failed");
      const headers = { "x-rementum-user-id": owner.user.id };

      const makeBrain = async (slug: string) => {
        const created = await app.inject({
          method: "POST",
          url: "/api/v1/brains",
          headers,
          payload: { workspaceId: owner.workspaceId, slug, name: slug },
        });
        expect(created.statusCode, created.body).toBe(201);
        return created.json().brain.id as string;
      };

      const makeArticle = async (brainId: string, slug: string) => {
        const staged = await app.inject({
          method: "POST",
          url: "/api/v1/writes",
          headers,
          payload: {
            brainId,
            operation: "create",
            slug,
            title: slug,
            keywords: [slug],
            body: `# ${slug}\n\nBody for ${slug}.`,
            changeSummary: `Add ${slug}`,
          },
        });
        expect(staged.statusCode, staged.body).toBe(201);
        const promoted = await app.inject({
          method: "POST",
          url: `/api/v1/writes/${staged.json().id}/promote`,
          headers,
          payload: { decisionSummary: "Reviewed" },
        });
        expect(promoted.statusCode, promoted.body).toBe(200);
        return promoted.json().article.id as string;
      };

      const brainId = await makeBrain(`links-a-${suffix}`);
      const otherBrainId = await makeBrain(`links-b-${suffix}`);
      const [from, first, second] = await Promise.all([
        makeArticle(brainId, "origin"),
        makeArticle(brainId, "first"),
        makeArticle(brainId, "second"),
      ]);
      const foreign = await makeArticle(otherBrainId, "foreign");
      const actor = await store.loadActor(owner.user.id, "test");

      // Several links in one call: the insert batches, so all of them have to land.
      await store.setArticleLinks(
        from,
        [
          { toArticleId: first, relation: "related" },
          { toArticleId: second, relation: "related" },
          { toArticleId: first, relation: "supersedes" },
        ],
        actor,
      );
      expect(await store.getArticleLinks(from, actor)).toHaveLength(3);

      // Setting links replaces the previous set rather than adding to it.
      await store.setArticleLinks(from, [{ toArticleId: second, relation: "related" }], actor);
      expect(await store.getArticleLinks(from, actor)).toMatchObject([
        { articleId: second, slug: "second", relation: "related" },
      ]);

      // One target outside the brain rejects the whole call, and the transaction leaves
      // the links that were already there untouched.
      await expect(
        store.setArticleLinks(
          from,
          [
            { toArticleId: first, relation: "related" },
            { toArticleId: foreign, relation: "related" },
          ],
          actor,
        ),
      ).rejects.toThrow(ConflictError);
      expect(await store.getArticleLinks(from, actor)).toMatchObject([{ articleId: second }]);

      // The input is a list but the table holds a set: the same target and relation twice
      // used to break the whole call on the primary key.
      await store.setArticleLinks(
        from,
        [
          { toArticleId: first, relation: "related" },
          { toArticleId: first, relation: "related" },
          { toArticleId: second, relation: "related" },
        ],
        actor,
      );
      expect(await store.getArticleLinks(from, actor)).toMatchObject([
        { articleId: first },
        { articleId: second },
      ]);

      // An empty set clears the links without running an insert.
      await store.setArticleLinks(from, [], actor);
      expect(await store.getArticleLinks(from, actor)).toHaveLength(0);

      // Task attachments batch the same way.
      const task = await store.createTask(
        {
          brainId,
          title: "Batched task",
          brief: "Attach several things at once",
          priority: 2,
          articleIds: [first, second],
          links: ["https://one.test", "https://two.test", "https://three.test"],
        } as never,
        actor,
      );
      // Nothing in the store reads these join tables back, so the rows are checked
      // directly under the same row-level security the insert ran with.
      const attached = await database.sql.begin(async (tx) => {
        await setActorConfig(tx, actor);
        const articles = await tx<Array<{ article_id: string }>>`
          SELECT article_id FROM task_articles WHERE task_id = ${task.id} ORDER BY article_id
        `;
        const links = await tx<Array<{ url: string }>>`
          SELECT url FROM task_links WHERE task_id = ${task.id} ORDER BY url
        `;
        return { articles: articles.map((row) => row.article_id), links: links.map((r) => r.url) };
      });
      expect(attached.articles).toEqual([first, second].sort());
      expect(attached.links).toEqual([
        "https://one.test",
        "https://three.test",
        "https://two.test",
      ]);
    } finally {
      await app.close();
      await database.close();
    }
  }, 120_000);
});
