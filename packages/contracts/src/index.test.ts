import { describe, expect, it } from "vitest";
import {
  brainArticleCountSchema,
  createTaskSchema,
  externalUrlSchema,
  loadContextSchema,
  mcpAnalyticsRangeSchema,
  mcpAnalyticsSchema,
  routingIndexSortSchema,
  stageWriteSchema,
  toolNames,
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
