import { randomBytes } from "node:crypto";
import { WEB_SESSION_CLIENT_ID } from "@rementum/contracts";
import { AuthRepository, createDatabaseClient, PostgresStore } from "@rementum/db";
import { exportJWK, generateKeyPair } from "jose";
import JSZip from "jszip";
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
    // Unroutable: search has to fall back to metadata ranking rather than fail.
    REMENTUM_EMBEDDINGS_URL: "http://127.0.0.1:9",
    REMENTUM_DEV_AUTH: "true",
    REMENTUM_LOG_LEVEL: "silent",
  });
}

integration("knowledge lifecycle", () => {
  it("stages, promotes, reads, searches, and exports one article", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const app = await buildApp(await testConfig(suffix), { mailer: null });
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);

    try {
      const owner = await auth.registerAccount(
        `lifecycle-owner-${suffix}@example.test`,
        "Owner",
        "owner-password-hash",
        "Lifecycle team",
        `lifecycle-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const as = (userId: string) => ({ "x-rementum-user-id": userId });

      const brain = await app.inject({
        method: "POST",
        url: "/api/v1/brains",
        headers: as(owner.user.id),
        payload: {
          workspaceId: owner.workspaceId,
          slug: `product-${suffix}`,
          name: "Product knowledge",
          instructions: "Keep entries short.",
        },
      });
      expect(brain.statusCode).toBe(201);
      const brainId = brain.json().brain.id;
      expect(brain.json().brain).not.toHaveProperty("wrappedKey");

      const staged = await app.inject({
        method: "POST",
        url: "/api/v1/writes",
        headers: as(owner.user.id),
        payload: {
          brainId,
          operation: "create",
          slug: "architecture",
          title: "Architecture",
          keywords: ["architecture", "encryption"],
          body: "# Architecture\n\nArticle bodies are encrypted with a per-brain key.",
          changeSummary: "Record the architecture",
        },
      });
      expect(staged.statusCode).toBe(201);
      expect(staged.json()).toMatchObject({ status: "pending" });
      expect(staged.json()).not.toHaveProperty("body");
      const writeId = staged.json().id;

      const review = await app.inject({
        method: "GET",
        url: `/api/v1/writes/${writeId}/review`,
        headers: as(owner.user.id),
      });
      expect(review.statusCode).toBe(200);
      expect(review.json().currentBody).toBeNull();
      expect(review.json().candidateBody).toContain("per-brain key");

      const pending = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/writes?status=pending`,
        headers: as(owner.user.id),
      });
      expect(pending.json()).toHaveLength(1);

      const promoted = await app.inject({
        method: "POST",
        url: `/api/v1/writes/${writeId}/promote`,
        headers: as(owner.user.id),
        payload: { decisionSummary: "Reviewed and accurate" },
      });
      expect(promoted.statusCode).toBe(200);
      expect(promoted.json().version.version).toBe(1);
      const articleId = promoted.json().article.id;

      const index = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}`,
        headers: as(owner.user.id),
      });
      expect(index.json().routingIndex).toMatchObject([
        { id: articleId, slug: "architecture", currentVersion: 1 },
      ]);

      const article = await app.inject({
        method: "GET",
        url: `/api/v1/articles/${articleId}`,
        headers: as(owner.user.id),
      });
      expect(article.json().body).toContain("per-brain key");
      expect(article.json().provenance.changeSummary).toBe("Record the architecture");

      // Row-level security is the floor: a connection carrying no actor context sees no rows,
      // even though the application role owns the query.
      const withoutContext = await database.sql`
        SELECT 1 FROM article_versions WHERE article_id = ${articleId}::uuid
      `;
      expect(withoutContext).toHaveLength(0);

      const stale = await app.inject({
        method: "POST",
        url: "/api/v1/writes",
        headers: as(owner.user.id),
        payload: {
          brainId,
          operation: "update",
          articleId,
          baseVersion: 1,
          slug: "architecture",
          title: "Architecture",
          body: "# Architecture\n\nA second revision.",
          changeSummary: "Revise",
        },
      });
      expect(stale.statusCode).toBe(201);
      const secondPromotion = await app.inject({
        method: "POST",
        url: `/api/v1/writes/${stale.json().id}/promote`,
        headers: as(owner.user.id),
        payload: { decisionSummary: "Second revision" },
      });
      expect(secondPromotion.json().version.version).toBe(2);

      const history = await app.inject({
        method: "GET",
        url: `/api/v1/articles/${articleId}/history`,
        headers: as(owner.user.id),
      });
      expect(history.json().map((version: { version: number }) => version.version)).toEqual([2, 1]);
      expect(JSON.stringify(history.json())).not.toContain("A second revision");

      const search = await app.inject({
        method: "POST",
        url: "/api/v1/search",
        headers: as(owner.user.id),
        payload: { brainId, query: "architecture" },
      });
      expect(search.statusCode).toBe(200);
      // The embedding service is unreachable in this configuration, so ranking falls back to
      // full-text search rather than failing the request.
      expect(search.json()[0]).toMatchObject({
        article: { slug: "architecture", currentVersion: 2 },
        sources: ["fts"],
      });

      const activity = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/activity`,
        headers: as(owner.user.id),
      });
      const actions = activity.json().map((event: { action: string }) => event.action);
      expect(actions).toContain("article.search");
      expect(actions).toContain("brain.read");

      // source=mcp keeps events from agent clients (dev-auth audits as "dev-header")
      // and drops browser-session events and legacy rows with no client at all.
      const store = new PostgresStore(database);
      const webActor = await store.loadActor(owner.user.id, WEB_SESSION_CLIENT_ID);
      await store.audit(webActor, "article.read", `brain:${brainId}`);
      const legacyActor = await store.loadActor(owner.user.id, null);
      await store.audit(legacyActor, "article.read", `brain:${brainId}`);
      const unfiltered = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/activity`,
        headers: as(owner.user.id),
      });
      const unfilteredClients = unfiltered
        .json()
        .map((event: { clientId: string | null }) => event.clientId);
      expect(unfilteredClients).toContain(WEB_SESSION_CLIENT_ID);
      expect(unfilteredClients).toContain(null);
      const mcpOnly = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/activity?source=mcp`,
        headers: as(owner.user.id),
      });
      const mcpClients = mcpOnly.json().map((event: { clientId: string | null }) => event.clientId);
      expect(mcpClients).toContain("dev-header");
      expect(mcpClients).not.toContain(WEB_SESSION_CLIENT_ID);
      expect(mcpClients).not.toContain(null);

      const exported = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/export`,
        headers: as(owner.user.id),
      });
      expect(exported.statusCode).toBe(200);
      const zip = await JSZip.loadAsync(exported.rawPayload);
      expect(Object.keys(zip.files).sort()).toEqual(["architecture.md", "manifest.json"]);
      const manifest = JSON.parse(
        await (zip.file("manifest.json") as JSZip.JSZipObject).async("string"),
      );
      expect(manifest.articles).toMatchObject([{ slug: "architecture", version: 2 }]);

      // A second article makes the routing index pageable: offset 1 skips the newer
      // "conventions" article and articleTotal reports the full count, not the page.
      const second = await app.inject({
        method: "POST",
        url: "/api/v1/writes",
        headers: as(owner.user.id),
        payload: {
          brainId,
          operation: "create",
          slug: "conventions",
          title: "Conventions",
          body: "# Conventions\n\nKeep entries short.",
          changeSummary: "Record the conventions",
        },
      });
      expect(second.statusCode).toBe(201);
      const secondPromoted = await app.inject({
        method: "POST",
        url: `/api/v1/writes/${second.json().id}/promote`,
        headers: as(owner.user.id),
        payload: { decisionSummary: "Reviewed" },
      });
      expect(secondPromoted.statusCode).toBe(200);

      const indexPage = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}?limit=1&offset=1`,
        headers: as(owner.user.id),
      });
      expect(indexPage.json()).toMatchObject({
        articleTotal: 2,
        routingIndex: [{ slug: "architecture" }],
      });
      expect(indexPage.json().routingIndex).toHaveLength(1);

      const brainPage = await app.inject({
        method: "GET",
        url: `/api/v1/brains?workspaceId=${owner.workspaceId}&limit=1&offset=0`,
        headers: as(owner.user.id),
      });
      expect(brainPage.json().total).toBe(1);
      expect(brainPage.json().items).toMatchObject([{ id: brainId }]);

      // The owner belongs to the brain's workspace, so nothing is "shared" with them.
      const sharedForOwner = await app.inject({
        method: "GET",
        url: "/api/v1/brains?shared=true",
        headers: as(owner.user.id),
      });
      expect(sharedForOwner.json()).toEqual({ items: [], total: 0 });

      const stranger = await auth.registerAccount(
        `lifecycle-stranger-${suffix}@example.test`,
        "Stranger",
        "stranger-password-hash",
        "Stranger team",
        `stranger-${suffix}`,
      );
      if (!stranger) throw new Error("Stranger registration failed");
      // A brain-scoped route refuses on the role check; an article-scoped one cannot even see
      // the row, so it answers as if the article did not exist.
      for (const [url, status] of [
        [`/api/v1/brains/${brainId}`, 403],
        [`/api/v1/brains/${brainId}/activity`, 403],
        [`/api/v1/brains/${brainId}/export`, 403],
        [`/api/v1/articles/${articleId}`, 404],
        [`/api/v1/articles/${articleId}/history`, 404],
      ] as const) {
        const response = await app.inject({
          method: "GET",
          url,
          headers: as(stranger.user.id),
        });
        expect(response.statusCode, url).toBe(status);
      }
      const strangerBrains = await app.inject({
        method: "GET",
        url: "/api/v1/brains",
        headers: as(stranger.user.id),
      });
      expect(strangerBrains.json()).toEqual({ items: [], total: 0 });
    } finally {
      await database.close();
      await app.close();
    }
  }, 60_000);

  it("coordinates a task through its lease", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const app = await buildApp(await testConfig(suffix), { mailer: null });
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);

    try {
      const owner = await auth.registerAccount(
        `task-owner-${suffix}@example.test`,
        "Owner",
        "owner-password-hash",
        "Task team",
        `tasks-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const headers = { "x-rementum-user-id": owner.user.id };

      const brain = await app.inject({
        method: "POST",
        url: "/api/v1/brains",
        headers,
        payload: { workspaceId: owner.workspaceId, slug: `tasks-${suffix}`, name: "Task brain" },
      });
      expect(brain.statusCode, brain.body).toBe(201);
      const brainId = brain.json().brain.id;

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers,
        payload: { brainId, title: "Document the export format", brief: "Write it down." },
      });
      expect(created.statusCode).toBe(201);
      const taskId = created.json().id;
      expect(created.json().status).toBe("open");

      const claimed = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/claim",
        headers,
        payload: { brainId, leaseSeconds: 600 },
      });
      expect(claimed.json()).toMatchObject({ id: taskId, status: "claimed" });

      const secondClaim = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/claim",
        headers,
        payload: { brainId, leaseSeconds: 600 },
      });
      expect(secondClaim.json()).toBeNull();

      const heartbeat = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskId}/heartbeat`,
        headers,
        payload: { leaseSeconds: 900 },
      });
      expect(new Date(heartbeat.json().leaseExpiresAt).getTime()).toBeGreaterThan(Date.now());

      const comment = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskId}/comments`,
        headers,
        payload: { body: "Started on the manifest section." },
      });
      expect(comment.statusCode).toBe(201);
      const comments = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${taskId}/comments`,
        headers,
      });
      expect(comments.json()).toHaveLength(1);

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${taskId}`,
        headers,
        payload: { status: "review", priority: 10 },
      });
      expect(updated.json()).toMatchObject({ status: "review", priority: 10 });

      const released = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskId}/release`,
        headers,
        payload: {},
      });
      expect(released.json().claimedBy).toBeNull();

      const listed = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/tasks`,
        headers,
      });
      expect(listed.json()).toHaveLength(1);

      const scan = await app.inject({
        method: "POST",
        url: `/api/v1/brains/${brainId}/maintenance/scan`,
        headers,
      });
      expect(scan.statusCode).toBe(200);
      const maintenance = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/maintenance`,
        headers,
      });
      expect(Array.isArray(maintenance.json())).toBe(true);
    } finally {
      await database.close();
      await app.close();
    }
  }, 60_000);
});
