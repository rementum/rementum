import { randomBytes } from "node:crypto";
import { mcpAnalyticsSchema } from "@rementum/contracts";
import { hashContent, NotFoundError, RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("MCP usage analytics", () => {
  it("aggregates exact calls by workspace while RLS keeps tenants isolated", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(
      store,
      {
        embedQuery: async () => ({ model: "test-model", vector: [] }),
        embedPassages: async () => ({ model: "test-model", vectors: [] }),
        healthy: async () => false,
      },
      Buffer.alloc(32, 7),
    );
    const suffix = randomBytes(6).toString("hex");

    try {
      const owner = await auth.registerAccount(
        `analytics-owner-${suffix}@example.test`,
        "Analytics owner",
        "owner-password-hash",
        "Analytics team",
        `analytics-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const ownerActor = await store.loadActor(owner.user.id, "owner-browser");
      const brain = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `analytics-${suffix}`,
          name: "Analytics brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const write = await service.stageWrite(
        {
          brainId: brain.brain.id,
          operation: "create",
          slug: `usage-${suffix}`,
          title: "Usage article",
          keywords: [],
          kind: "canonical",
          body: "Tracked article body.",
          changeSummary: "Create usage article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        ownerActor,
      );
      await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "Approve" },
        ownerActor,
      );
      const articleId = write.articleId;
      if (!articleId) throw new Error("Created write did not target an article");

      const firstClient = `analytics-client-a-${suffix}`;
      const secondClient = `analytics-client-b-${suffix}`;
      for (const clientId of [firstClient, secondClient]) {
        await database.sql`
          INSERT INTO oauth_records (model, id, payload)
          VALUES ('Client', ${clientId}, ${JSON.stringify({ clientName: "Codex" })}::jsonb)
          ON CONFLICT (model, id) DO NOTHING
        `;
      }
      const firstActor = await store.loadActor(owner.user.id, firstClient);
      const secondActor = await store.loadActor(owner.user.id, secondClient);
      await service.recordMcpToolCall(
        {
          workspaceId: owner.workspaceId,
          tool: "read_article",
          articleId,
          articleIds: [articleId, articleId],
        },
        firstActor,
      );
      await service.recordMcpToolCall(
        {
          workspaceId: owner.workspaceId,
          tool: "load_context",
          brainId: brain.brain.id,
          articleIds: [articleId],
        },
        secondActor,
      );
      await service.recordMcpToolCall(
        {
          workspaceId: owner.workspaceId,
          tool: "list_brains",
          articleIds: [],
        },
        secondActor,
      );

      const analytics = await service.getMcpAnalytics(owner.workspaceId, "30d", ownerActor);
      expect(analytics.totals).toEqual({
        calls: 3,
        activeClients: 1,
        activeBrains: 1,
        articlesConsumed: 1,
      });
      expect(mcpAnalyticsSchema.parse(analytics)).toEqual(analytics);
      expect(analytics.daily).toHaveLength(365);
      expect(analytics.daily.at(-1)).toMatchObject({
        date: new Date().toISOString().slice(0, 10),
        calls: 3,
        tracked: true,
      });
      expect(analytics.topClients).toMatchObject([{ name: "Codex", calls: 3, registrations: 2 }]);
      expect(analytics.topBrains).toMatchObject([{ id: brain.brain.id, calls: 2 }]);
      expect(analytics.topArticles).toMatchObject([
        { id: articleId, brainId: brain.brain.id, uses: 2 },
      ]);
      expect(analytics.topTools.map((tool) => tool.tool).sort()).toEqual([
        "list_brains",
        "load_context",
        "read_article",
      ]);
      expect(analytics.recentCalls).toHaveLength(3);

      const brainAnalytics = await service.getMcpAnalytics(
        owner.workspaceId,
        "30d",
        ownerActor,
        brain.brain.id,
      );
      expect(brainAnalytics.totals.calls).toBe(2);
      expect(brainAnalytics.recentCalls.every((call) => call.brainId === brain.brain.id)).toBe(
        true,
      );

      const member = await auth.registerAccount(
        `analytics-member-${suffix}@example.test`,
        "Analytics member",
        "member-password-hash",
        "Member team",
        `analytics-member-${suffix}`,
      );
      if (!member) throw new Error("Member registration failed");
      const invitation = await service.proposeTeamInvite(
        owner.teamId,
        member.user.email,
        "member",
        ownerActor,
      );
      await auth.acceptTeamInvitation(hashContent(invitation.token), member.user.id, null, null);
      const memberActor = await store.loadActor(member.user.id, "member-browser");
      await expect(
        service.getMcpAnalytics(owner.workspaceId, "30d", memberActor),
      ).resolves.toMatchObject({ totals: { calls: 3 } });

      const stranger = await auth.registerAccount(
        `analytics-stranger-${suffix}@example.test`,
        "Analytics stranger",
        "stranger-password-hash",
        "Stranger team",
        `analytics-stranger-${suffix}`,
      );
      if (!stranger) throw new Error("Stranger registration failed");
      const strangerActor = await store.loadActor(stranger.user.id, "stranger-browser");
      await expect(
        store.getMcpAnalytics(owner.workspaceId, "30d", strangerActor),
      ).rejects.toBeInstanceOf(NotFoundError);

      const columns = await database.sql<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'mcp_tool_calls'
      `;
      expect(columns.map((column) => column.column_name)).not.toContain("actor_id");
      const [workspaceForeignKey] = await database.sql<Array<{ delete_action: string }>>`
        SELECT confdeltype AS delete_action
        FROM pg_constraint
        WHERE conrelid = 'mcp_tool_calls'::regclass
          AND confrelid = 'workspaces'::regclass
          AND contype = 'f'
      `;
      expect(workspaceForeignKey?.delete_action).toBe("c");
    } finally {
      await database.close();
    }
  });
});
