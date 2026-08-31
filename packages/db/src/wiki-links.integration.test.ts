import { randomBytes } from "node:crypto";
import type { Actor } from "@rementum/core";
import { RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("article wiki links", () => {
  it("resolves aliases, preserves renamed slugs, and keeps manual relations separate", async () => {
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

    const promote = async (actor: Actor, input: Parameters<RementumService["stageWrite"]>[0]) => {
      const write = await service.stageWrite(input, actor);
      return service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "Approve" },
        actor,
      );
    };

    try {
      const owner = await auth.registerAccount(
        `wiki-${suffix}@example.test`,
        "Wiki Owner",
        "wiki-owner-password-hash",
        "Wiki team",
        `wiki-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const actor = await store.loadActor(owner.user.id, "integration-test");
      const createdBrain = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `wiki-${suffix}`,
          name: "Wiki brain",
          description: "",
          instructions: "",
        },
        actor,
      );
      const brainId = createdBrain.brain.id;
      const alias = `legacy-${suffix}`;
      const destinationSlug = `destination-${suffix}`;

      const source = await promote(actor, {
        brainId,
        operation: "create",
        slug: `source-${suffix}`,
        title: "Source",
        keywords: [],
        aliases: [],
        kind: "canonical",
        body: `See [[${alias}|the destination]].`,
        changeSummary: "Create source",
        sources: [],
        acknowledgePotentialConflicts: false,
      });
      const sourceId = source.article.id;
      await expect(service.readArticle(sourceId, actor)).resolves.toMatchObject({
        relationsIndexed: true,
        links: [],
        unresolvedLinks: [{ targetSlug: alias, relation: "wiki" }],
      });
      expect(
        (await service.scanMaintenance(brainId, actor)).some(
          (candidate) => candidate.kind === "broken_link" && candidate.detail.targetSlug === alias,
        ),
      ).toBe(true);

      const destination = await promote(actor, {
        brainId,
        operation: "create",
        slug: destinationSlug,
        title: "Destination",
        keywords: [],
        aliases: [alias],
        kind: "canonical",
        body: "Destination body.",
        changeSummary: "Create destination",
        sources: [],
        acknowledgePotentialConflicts: false,
      });
      const destinationId = destination.article.id;
      const resolvedSource = await service.readArticle(sourceId, actor);
      expect(resolvedSource.unresolvedLinks).toEqual([]);
      expect(resolvedSource.links).toMatchObject([
        {
          articleId: destinationId,
          targetSlug: alias,
          relation: "wiki",
          origin: "wiki",
        },
      ]);
      expect((await service.readArticle(destinationId, actor)).backlinks).toMatchObject([
        { articleId: sourceId, targetSlug: alias, origin: "wiki" },
      ]);
      expect(
        (await service.scanMaintenance(brainId, actor)).some(
          (candidate) => candidate.kind === "broken_link" && candidate.detail.targetSlug === alias,
        ),
      ).toBe(false);

      await service.setArticleLinks(
        sourceId,
        [{ toArticleId: destinationId, relation: "supports" }],
        actor,
      );
      expect((await service.readArticle(sourceId, actor)).links).toMatchObject([
        { articleId: destinationId, relation: "supports", origin: "manual" },
        { articleId: destinationId, relation: "wiki", origin: "wiki" },
      ]);

      const renamedSlug = `renamed-${suffix}`;
      await promote(actor, {
        brainId,
        operation: "update",
        articleId: destinationId,
        baseVersion: 1,
        slug: renamedSlug,
        title: "Renamed destination",
        keywords: [],
        aliases: [],
        kind: "canonical",
        body: "Destination body.",
        changeSummary: "Rename destination",
        sources: [],
        acknowledgePotentialConflicts: false,
      });
      expect((await store.getArticleBySlug(brainId, destinationSlug, actor))?.id).toBe(
        destinationId,
      );
      expect((await service.readArticle(destinationId, actor)).aliases).toEqual(
        expect.arrayContaining([alias, destinationSlug]),
      );

      await promote(actor, {
        brainId,
        operation: "update",
        articleId: sourceId,
        baseVersion: 1,
        slug: source.article.slug,
        title: "Source",
        keywords: [],
        aliases: [],
        kind: "canonical",
        body: "The body no longer contains a wiki link.",
        changeSummary: "Remove wiki link",
        sources: [],
        acknowledgePotentialConflicts: false,
      });
      expect((await service.readArticle(sourceId, actor)).links).toMatchObject([
        { articleId: destinationId, relation: "supports", origin: "manual" },
      ]);
      const graph = await service.getArticleGraph(brainId, actor);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toMatchObject([
        {
          fromArticleId: sourceId,
          toArticleId: destinationId,
          relation: "supports",
          origin: "manual",
        },
      ]);
      expect(graph.pendingRelationIndexes).toBe(0);
    } finally {
      await database.close();
    }
  });
});
