import { randomBytes } from "node:crypto";
import { RementumService } from "@rementum/core";
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
