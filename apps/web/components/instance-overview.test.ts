import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InstanceOverview } from "../lib/admin";
import { InstanceOverviewView } from "./instance-overview";

describe("InstanceOverviewView", () => {
  it("renders every figure with a UTC label and names each bar's day", () => {
    const html = renderToStaticMarkup(
      createElement(InstanceOverviewView, { overview: overview() }),
    );

    expect(html).toContain("Every team on this instance · UTC");
    expect(html).toContain("Sep 2, 2026, 12:00 PM UTC");
    expect(html).toContain("1,234");
    expect(html).toContain("New accounts");
    expect(html).toContain("MCP tool calls");
    expect(html).toContain("Sep 2, 2026: 7 sign-ups");
    expect(html).toContain("Sep 1, 2026: 1 call");
    expect(html).toContain("Peak 7");
    expect(html).toContain("Writes in conflict");
    expect(html).toContain("text-orange");
    expect(html).toContain("50.0 MB");
    expect(html).toContain("Live MCP connections");
  });
});

function overview(): InstanceOverview {
  const today = Date.parse("2026-09-02T00:00:00.000Z");
  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today - (29 - index) * 86_400_000).toISOString().slice(0, 10);
    return {
      date,
      signups: index === 29 ? 7 : 0,
      calls: index === 28 ? 1 : index === 29 ? 3 : 0,
    };
  });
  return {
    generatedAt: "2026-09-02T12:00:00.000Z",
    timeZone: "UTC",
    accounts: {
      total: 1234,
      verified: 1200,
      unverified: 30,
      disabled: 4,
      systemOwners: 1,
      newLast7Days: 7,
      newLast30Days: 40,
      activeLast7Days: 300,
      activeLast30Days: 800,
    },
    knowledge: {
      teams: 20,
      workspaces: 25,
      brains: 60,
      articles: 4000,
      versions: 9000,
      pendingWrites: 3,
      conflictedWrites: 2,
      openTasks: 5,
      claimedTasks: 1,
    },
    usage: {
      mcpCallsLast24Hours: 3,
      mcpCallsLast7Days: 4,
      mcpCallsLast30Days: 4,
      mcpCallsTotal: 4,
      activeClientsLast30Days: 2,
      webSessions: 9,
      mcpConnections: 11,
    },
    compaction: { queued: 0, processing: 0, failed: 0 },
    storage: { databaseBytes: 52_428_800 },
    daily,
  };
}
