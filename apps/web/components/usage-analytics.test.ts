import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageAnalytics } from "../lib/analytics";
import { UsageAnalyticsView } from "./usage-analytics";

describe("UsageAnalyticsView", () => {
  it("renders accessible UTC usage data and escapes client labels", () => {
    const html = renderToStaticMarkup(
      createElement(UsageAnalyticsView, {
        analytics: analytics(),
        range: "30d",
        rangePath: "/activity",
      }),
    );

    expect(html).toContain("Daily brain usage");
    expect(html).toContain("successful MCP calls");
    expect(html).toContain("not tracked");
    expect(html).toContain("Top clients");
    expect(html).toContain("Team leaderboard");
    expect(html).toContain("1 write promoted");
    expect(html).toContain("No activity in this range");
    expect(html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(html).toContain("Recent tool calls");
    expect(html).toContain("&lt;script&gt;client&lt;/script&gt;");
    expect(html).not.toContain("<script>client</script>");
  });
});

function analytics(): UsageAnalytics {
  const today = Date.parse("2026-09-01T00:00:00.000Z");
  const daily = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(today - (364 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, calls: index === 364 ? 3 : 0, tracked: index >= 360 };
  });
  return {
    scope: {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      brainId: null,
    },
    trackingStartedAt: "2026-08-28T00:00:00.000Z",
    generatedAt: "2026-09-01T12:00:00.000Z",
    timeZone: "UTC",
    range: "30d",
    totals: { calls: 3, activeClients: 1, activeBrains: 1, articlesConsumed: 1 },
    daily,
    topClients: [
      {
        name: "<script>client</script>",
        calls: 3,
        registrations: 1,
        lastUsedAt: "2026-09-01T12:00:00.000Z",
      },
    ],
    topBrains: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Product",
        calls: 3,
        lastUsedAt: "2026-09-01T12:00:00.000Z",
      },
    ],
    topArticles: [
      {
        id: "00000000-0000-4000-8000-000000000003",
        brainId: "00000000-0000-4000-8000-000000000002",
        brainName: "Product",
        title: "Architecture",
        uses: 2,
        lastUsedAt: "2026-09-01T12:00:00.000Z",
      },
    ],
    topTools: [{ tool: "load_context", calls: 2, lastUsedAt: "2026-09-01T12:00:00.000Z" }],
    topMembers: [
      {
        userId: "00000000-0000-4000-8000-000000000005",
        name: "<b>Ada</b>",
        role: "owner",
        actions: 4,
        writes: 1,
        lastActiveAt: "2026-09-01T12:00:00.000Z",
      },
      {
        userId: "00000000-0000-4000-8000-000000000006",
        name: "Grace",
        role: "member",
        actions: 0,
        writes: 0,
        lastActiveAt: null,
      },
    ],
    recentCalls: [
      {
        id: "00000000-0000-4000-8000-000000000004",
        tool: "load_context",
        clientName: "<script>client</script>",
        brainId: "00000000-0000-4000-8000-000000000002",
        brainName: "Product",
        createdAt: "2026-09-01T12:00:00.000Z",
      },
    ],
  };
}
