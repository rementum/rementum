import { randomBytes } from "node:crypto";
import type { Actor } from "@rementum/core";
import { RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("article counts", () => {
  it("counts per readable brain and shows other users nothing", async () => {
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

    const createArticle = async (brainId: string, slug: string, actor: Actor) => {
      const write = await service.stageWrite(
        {
          brainId,
          operation: "create",
          slug,
          title: `Article ${slug}`,
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
        `counter-${suffix}@example.test`,
        "Counter",
        "counter-password-hash",
        "Count team",
        `count-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const ownerActor = await store.loadActor(owner.user.id, "integration-test");

      const brainInput = (slug: string, name: string) => ({
        workspaceId: owner.workspaceId,
        slug,
        name,
        description: "",
        instructions: "",
      });
      const full = await service.createBrain(
        brainInput(`full-${suffix}`, "Full brain"),
        ownerActor,
      );
      const thin = await service.createBrain(
        brainInput(`thin-${suffix}`, "Thin brain"),
        ownerActor,
      );
      const empty = await service.createBrain(
        brainInput(`empty-${suffix}`, "Empty brain"),
        ownerActor,
      );
      await createArticle(full.brain.id, `first-${suffix}`, ownerActor);
      await createArticle(full.brain.id, `second-${suffix}`, ownerActor);
      await createArticle(thin.brain.id, `only-${suffix}`, ownerActor);

      const stats = new Map(
        (await service.countArticlesByBrain(ownerActor)).map((row) => [row.brainId, row]),
      );
      expect(stats.get(full.brain.id)?.articleCount).toBe(2);
      expect(stats.get(thin.brain.id)?.articleCount).toBe(1);
      // GROUP BY yields no row for a brain without articles; callers treat absence as zero.
      expect(stats.has(empty.brain.id)).toBe(false);

      // The aggregate's MAX(updated_at) must agree with the newest routing-index entry.
      const fullBrain = await service.getBrain(full.brain.id, ownerActor);
      expect(stats.get(full.brain.id)?.latestArticleUpdatedAt).toBe(
        fullBrain.routingIndex[0]?.updatedAt,
      );

      // A different account passes no application-level guard here at all, so the empty
      // result has to come from the row-level policies on articles.
      const stranger = await auth.registerAccount(
        `stranger-${suffix}@example.test`,
        "Stranger",
        "stranger-password-hash",
        "Stranger team",
        `stranger-${suffix}`,
      );
      if (!stranger) throw new Error("Stranger registration failed");
      const strangerActor = await store.loadActor(stranger.user.id, "integration-test");
      const strangerCounts = await service.countArticlesByBrain(strangerActor);
      expect(strangerCounts.map((row) => row.brainId)).not.toContain(full.brain.id);
      expect(strangerCounts.map((row) => row.brainId)).not.toContain(thin.brain.id);
    } finally {
      await database.close();
    }
  });
});
