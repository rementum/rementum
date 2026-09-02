import { randomBytes, randomUUID } from "node:crypto";
import { contentAad, encrypt, hashContent, RementumService, unwrapDataKey } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

function unitVector(): number[] {
  const raw = Array.from({ length: 384 }, (_, index) => Math.sin(index + 1));
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));
  return raw.map((value) => value / norm);
}

integration("embedding model changes", () => {
  it("excludes stale-model vectors from search and reports them unindexed", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const suffix = randomBytes(6).toString("hex");
    const vector = unitVector();
    const service = new RementumService(
      store,
      {
        embedQuery: async () => ({ model: "model-a", vector }),
        embedPassages: async (values: string[]) => ({
          model: "model-a",
          vectors: values.map(() => vector),
        }),
        healthy: async () => true,
      },
      Buffer.alloc(32, 7),
    );

    try {
      const owner = await auth.registerAccount(
        `embed-owner-${suffix}@example.test`,
        "Owner",
        "owner-password-hash",
        "Embedding team",
        `embed-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const ownerActor = await store.loadActor(owner.user.id, "integration-test");
      const brain = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `embed-${suffix}`,
          name: "Embedding brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const write = await service.stageWrite(
        {
          brainId: brain.brain.id,
          operation: "create",
          slug: `indexed-${suffix}`,
          title: "Indexed article",
          keywords: [],
          kind: "canonical",
          body: "A body about vector indexing.",
          changeSummary: "Create indexed article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        ownerActor,
      );
      const promoted = await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "Approve" },
        ownerActor,
      );
      // Promotion indexes in the background; reindex through the awaited path instead of racing it.
      await service.reindexArticle(promoted.article.id, ownerActor);

      // The query text matches nothing, so any hit can only come from the vector list.
      const activeModel = await store.search(
        { brainId: brain.brain.id, query: "zzzunmatchable", limit: 10 } as never,
        ownerActor,
        { model: "model-a", vector },
      );
      expect(activeModel.map((hit) => hit.article.id)).toContain(promoted.article.id);
      expect(activeModel[0]?.sources).toEqual(["vector"]);

      const staleModel = await store.search(
        { brainId: brain.brain.id, query: "zzzunmatchable", limit: 10 } as never,
        ownerActor,
        { model: "model-b", vector },
      );
      expect(staleModel).toEqual([]);

      const unindexedForA = await database.sql<Array<{ article_id: string }>>`
        SELECT article_id FROM owl_worker_unindexed_articles(100, 'model-a')
      `;
      expect(unindexedForA.map((row) => row.article_id)).not.toContain(promoted.article.id);

      const unindexedForB = await database.sql<Array<{ article_id: string }>>`
        SELECT article_id FROM owl_worker_unindexed_articles(100, 'model-b')
      `;
      expect(unindexedForB.map((row) => row.article_id)).toContain(promoted.article.id);
    } finally {
      await database.close();
    }
  });
});

integration("vector candidate ranking", () => {
  it("returns the nearest articles rather than the first fifty by id", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const suffix = randomBytes(6).toString("hex");
    const masterKey = Buffer.alloc(32, 7);
    const query = unitVector();
    const service = new RementumService(
      store,
      {
        embedQuery: async () => ({ model: "model-a", vector: query }),
        embedPassages: async () => ({ model: "model-a", vectors: [] }),
        healthy: async () => true,
      },
      masterKey,
    );
    // Any vector not parallel to the query ranks below it; this one differs in every
    // component so the target's similarity of one stands alone at the top.
    const raw = Array.from({ length: 384 }, (_, index) => Math.cos(index * 7 + 3));
    const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));
    const far = raw.map((value) => value / norm);

    try {
      const owner = await auth.registerAccount(
        `rank-owner-${suffix}@example.test`,
        "Owner",
        "owner-password-hash",
        "Ranking team",
        `rank-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const ownerActor = await store.loadActor(owner.user.id, "integration-test");
      const brain = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `rank-${suffix}`,
          name: "Ranking brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const record = await store.getBrain(brain.brain.id, ownerActor);
      if (!record) throw new Error("Brain missing");
      const key = unwrapDataKey(record.wrappedKey, masterKey, record.id);
      // Article ids ascend with their index, so the target, the last one, sorts after the
      // fifty lowest ids a DISTINCT ON ... LIMIT would have kept.
      const total = 60;
      const prefix = randomBytes(4).toString("hex");
      const ids = Array.from(
        { length: total },
        (_, index) => `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`,
      );
      for (const [index, articleId] of ids.entries()) {
        const writeId = randomUUID();
        const bodyAad = `brain:${record.id}:article:${articleId}:write:${writeId}`;
        const body = `Article ${index} body.`;
        await store.createStagedWrite(
          {
            brainId: record.id,
            operation: "create",
            slug: `article-${index}`,
            title: `Article ${index}`,
            summary: `Summary ${index}`,
            keywords: [],
            kind: "canonical",
            body,
            changeSummary: "seed",
            sources: [],
            acknowledgePotentialConflicts: false,
          },
          ownerActor,
          articleId,
          writeId,
          encrypt(body, key, bodyAad),
          bodyAad,
          hashContent(body),
          [],
        );
        await store.promoteStagedWrite(
          { writeId, decision: "promote", decisionSummary: "seed" },
          ownerActor,
          false,
          (_write, version) => ({
            body: encrypt(body, key, contentAad(record.id, articleId, version)),
            bodyAad: contentAad(record.id, articleId, version),
          }),
        );
        const vector = index === total - 1 ? query : far;
        await store.setEmbedding(articleId, 1, 0, vector, "model-a", ownerActor);
      }

      const hits = await store.search(
        { brainId: record.id, query: "zzzunmatchable", limit: 10 } as never,
        ownerActor,
        { model: "model-a", vector: query },
      );
      expect(hits).toHaveLength(10);
      expect(hits[0]?.article.id).toBe(ids[total - 1]);
      expect(hits[0]?.sources).toEqual(["vector"]);
      // Sixty unindexed-for-any-other-model articles would crowd the worker's window in
      // the sibling test on a database that is reused between runs.
      await store.deleteBrain(record.id, record.name, ownerActor);
    } finally {
      await database.close();
    }
  });
});
