import { describe, expect, it } from "vitest";
import {
  brainArticleCountSchema,
  createTaskSchema,
  externalUrlSchema,
  instanceOverviewSchema,
  listInstanceUsersSchema,
  loadContextSchema,
  mcpAnalyticsRangeSchema,
  mcpAnalyticsSchema,
  routingIndexSortSchema,
  stageWriteSchema,
  toolNames,
  updateTeamSchema,
  updateWorkspaceSchema,
} from "./index.js";

describe("stageWriteSchema", () => {
  it("does not publish or retain a caller-authored summary", () => {
    const parsed = stageWriteSchema.parse({
      brainId: "00000000-0000-4000-8000-000000000001",
      operation: "create",
      slug: "architecture",
      title: "Architecture",
      summary: "Caller-authored summary",
      body: "Canonical body",
      changeSummary: "Create architecture memory",
    });
    expect(parsed).not.toHaveProperty("summary");
  });
});

describe("updateTeamSchema", () => {
  it("accepts a valid team name and trims whitespace", () => {
    expect(updateTeamSchema.parse({ name: "  Engineering Core  " })).toEqual({
      name: "Engineering Core",
    });
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => updateTeamSchema.parse({ name: "" })).toThrow();
    expect(() => updateTeamSchema.parse({ name: "   " })).toThrow();
  });

  it("rejects a name exceeding 160 characters", () => {
    expect(() => updateTeamSchema.parse({ name: "a".repeat(161) })).toThrow();
  });
});

describe("updateWorkspaceSchema", () => {
  it("accepts a compaction-only workspace update", () => {
    expect(updateWorkspaceSchema.parse({ llmCompactionEnabled: true })).toEqual({
      llmCompactionEnabled: true,
    });
  });

  it("rejects an empty workspace update", () => {
    expect(() => updateWorkspaceSchema.parse({})).toThrow(/workspace field/i);
  });
});

describe("brainArticleCountSchema", () => {
  it("requires the latest article timestamp alongside the count", () => {
    const row = {
      brainId: "00000000-0000-4000-8000-000000000001",
      articleCount: 3,
      latestArticleUpdatedAt: "2026-08-27T10:00:00.000Z",
    };
    expect(brainArticleCountSchema.parse(row)).toEqual(row);
    expect(() =>
      brainArticleCountSchema.parse({ ...row, latestArticleUpdatedAt: undefined }),
    ).toThrow();
    expect(() =>
      brainArticleCountSchema.parse({ ...row, latestArticleUpdatedAt: "yesterday" }),
    ).toThrow();
  });
});

describe("routingIndexSortSchema", () => {
  it("accepts only the allowlisted sort keys", () => {
    expect(routingIndexSortSchema.parse("updated")).toBe("updated");
    expect(routingIndexSortSchema.parse("title")).toBe("title");
    expect(() => routingIndexSortSchema.parse("updated_at DESC")).toThrow();
  });
});

describe("loadContextSchema", () => {
  const input = {
    brainId: "00000000-0000-4000-8000-000000000001",
    query: "MCP token efficiency",
  };

  it("applies bounded retrieval defaults", () => {
    expect(loadContextSchema.parse(input)).toEqual({
      ...input,
      maxArticles: 4,
      maxChars: 24_000,
    });
    expect(toolNames).toContain("load_context");
  });

  it("rejects context requests outside the article and character budgets", () => {
    expect(() => loadContextSchema.parse({ ...input, maxArticles: 9 })).toThrow();
    expect(() => loadContextSchema.parse({ ...input, maxChars: 3999 })).toThrow();
    expect(() => loadContextSchema.parse({ ...input, maxChars: 100_001 })).toThrow();
  });
});

describe("mcpAnalyticsSchema", () => {
  it("accepts bounded ranges and an empty analytics response", () => {
    expect(mcpAnalyticsRangeSchema.options).toEqual(["7d", "30d", "90d", "365d"]);
    const value = {
      scope: {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        brainId: null,
      },
      trackingStartedAt: "2026-09-01T00:00:00.000Z",
      generatedAt: "2026-09-01T12:00:00.000Z",
      timeZone: "UTC",
      range: "30d",
      totals: { calls: 0, activeClients: 0, activeBrains: 0, articlesConsumed: 0 },
      daily: [{ date: "2026-09-01", calls: 0, tracked: true }],
      topClients: [],
      topBrains: [],
      topArticles: [],
      topTools: [],
      topMembers: [],
      recentCalls: [],
    };
    expect(mcpAnalyticsSchema.parse(value)).toEqual(value);
    expect(() => mcpAnalyticsRangeSchema.parse("all")).toThrow();
  });

  it("still reads usage recorded under a tool this build no longer registers", () => {
    const legacy = {
      scope: { workspaceId: "00000000-0000-4000-8000-000000000001", brainId: null },
      trackingStartedAt: "2026-09-01T00:00:00.000Z",
      generatedAt: "2026-09-01T12:00:00.000Z",
      timeZone: "UTC",
      range: "30d",
      totals: { calls: 1, activeClients: 1, activeBrains: 0, articlesConsumed: 0 },
      daily: [],
      topClients: [],
      topBrains: [],
      topArticles: [],
      topTools: [{ tool: "retired_tool", calls: 1, lastUsedAt: "2026-09-01T12:00:00.000Z" }],
      topMembers: [],
      recentCalls: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          tool: "retired_tool",
          clientName: "Codex",
          brainId: null,
          brainName: null,
          createdAt: "2026-09-01T12:00:00.000Z",
        },
      ],
    };
    expect(mcpAnalyticsSchema.parse(legacy)).toEqual(legacy);
  });
});

describe("externalUrlSchema", () => {
  it("accepts browser-navigable links", () => {
    expect(externalUrlSchema.parse("https://example.test/issues/1")).toBe(
      "https://example.test/issues/1",
    );
    expect(externalUrlSchema.parse("http://example.test")).toBe("http://example.test");
  });

  it("rejects script-bearing schemes", () => {
    for (const value of [
      "javascript:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(() => externalUrlSchema.parse(value)).toThrow(/http and https/);
    }
  });

  it("guards task links", () => {
    expect(() =>
      createTaskSchema.parse({
        brainId: "00000000-0000-4000-8000-000000000001",
        title: "Task",
        brief: "Brief",
        links: ["javascript:alert(1)"],
      }),
    ).toThrow(/http and https/);
  });
});

describe("titles", () => {
  it("rejects whitespace-only titles for writes and tasks", () => {
    const write = {
      brainId: "00000000-0000-4000-8000-000000000001",
      operation: "create",
      slug: "a",
      title: "   ",
      body: "Body",
      changeSummary: "c",
    };
    expect(stageWriteSchema.safeParse(write).success).toBe(false);
    expect(stageWriteSchema.safeParse({ ...write, title: " Padded " }).data?.title).toBe("Padded");
    expect(
      createTaskSchema.safeParse({ brainId: write.brainId, title: " \t", brief: "b" }).success,
    ).toBe(false);
  });
});

describe("instance administration schemas", () => {
  it("defaults and bounds the account listing query", () => {
    expect(listInstanceUsersSchema.parse({})).toEqual({ query: "", limit: 50, offset: 0 });
    expect(listInstanceUsersSchema.parse({ query: "  ada ", limit: "20", offset: "40" })).toEqual({
      query: "ada",
      limit: 20,
      offset: 40,
    });
    expect(() => listInstanceUsersSchema.parse({ limit: 201 })).toThrow();
    expect(() => listInstanceUsersSchema.parse({ query: "x".repeat(201) })).toThrow();
  });

  it("accepts an overview of counts and rejects a negative figure", () => {
    const overview = {
      generatedAt: "2026-09-02T12:00:00.000Z",
      timeZone: "UTC",
      accounts: {
        total: 3,
        verified: 2,
        unverified: 1,
        disabled: 0,
        systemOwners: 1,
        newLast7Days: 1,
        newLast30Days: 3,
        activeLast7Days: 2,
        activeLast30Days: 2,
      },
      knowledge: {
        teams: 2,
        workspaces: 2,
        brains: 4,
        articles: 40,
        versions: 90,
        pendingWrites: 1,
        conflictedWrites: 0,
        openTasks: 2,
        claimedTasks: 1,
      },
      usage: {
        mcpCallsLast24Hours: 5,
        mcpCallsLast7Days: 30,
        mcpCallsLast30Days: 120,
        mcpCallsTotal: 400,
        activeClientsLast30Days: 3,
        webSessions: 2,
        mcpConnections: 3,
      },
      compaction: { queued: 0, processing: 0, failed: 0 },
      storage: { databaseBytes: 52_428_800 },
      daily: [{ date: "2026-09-02", signups: 1, calls: 5 }],
    };
    expect(instanceOverviewSchema.parse(overview)).toEqual(overview);
    expect(() =>
      instanceOverviewSchema.parse({
        ...overview,
        accounts: { ...overview.accounts, total: -1 },
      }),
    ).toThrow();
    expect(() =>
      instanceOverviewSchema.parse({
        ...overview,
        daily: [{ date: "today", signups: 0, calls: 0 }],
      }),
    ).toThrow();
  });
});
