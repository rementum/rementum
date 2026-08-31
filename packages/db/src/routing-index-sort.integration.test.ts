import { randomBytes } from "node:crypto";
import type { Actor } from "@rementum/core";
import { RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("routing index sort", () => {
  it("orders by title or recency and shows other users nothing", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const suffix = randomBytes(6).toString("hex");
    const service = new RementumService(
      store,
      {
        embedQuery: async () => ({ model: "test-model", vector: [] }),
        embedPassages: async () => ({ model: "test-model", vectors: [] }),
        healthy: async () => false,
      },
      Buffer.alloc(32, 7),
    );

    const createArticle = async (brainId: string, slug: string, title: string, actor: Actor) => {
      const write = await service.stageWrite(
        {
          brainId,
          operation: "create",
          slug,
          title,
          keywords: [],
          aliases: [],
          kind: "canonical",
          body: `Body of ${slug}.`,
          changeSummary: "Create article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        actor,
      );
      await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "Approve" },
        actor,
      );
    };

    try {
      const owner = await auth.registerAccount(
        `sorter-${suffix}@example.test`,
        "Sorter",
        "sorter-password-hash",
        "Sort team",
        `sort-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const ownerActor = await store.loadActor(owner.user.id, "integration-test");

      const created = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `sorted-${suffix}`,
          name: "Sorted brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const brainId = created.brain.id;
      // Created in non-alphabetical order with mixed case, so a title sort cannot
      // accidentally pass by matching either recency or a case-sensitive collation.
      await createArticle(brainId, `banana-${suffix}`, "banana", ownerActor);
      await createArticle(brainId, `apple-${suffix}`, "Apple", ownerActor);
      await createArticle(brainId, `cherry-${suffix}`, "cherry", ownerActor);

      const byTitle = await service.getBrain(brainId, ownerActor, 200, "title");
      expect(byTitle.routingIndex.map((article) => article.title)).toEqual([
        "Apple",
        "banana",
        "cherry",
      ]);

      const byRecency = await service.getBrain(brainId, ownerActor, 200, "updated");
      expect(byRecency.routingIndex.map((article) => article.title)).toEqual([
        "cherry",
        "Apple",
        "banana",
      ]);

      // The store call skips the service's role guard entirely, so an empty result
      // for another account has to come from the row-level policies on articles.
      const stranger = await auth.registerAccount(
        `stranger-${suffix}@example.test`,
        "Stranger",
        "stranger-password-hash",
        "Stranger team",
        `stranger-${suffix}`,
      );
      if (!stranger) throw new Error("Stranger registration failed");
      const strangerActor = await store.loadActor(stranger.user.id, "integration-test");
      expect(await store.listRoutingIndex(brainId, strangerActor, 200, "title")).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
