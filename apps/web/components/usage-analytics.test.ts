import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageAnalytics } from "../lib/analytics";
import { relativeTime } from "../lib/format";
import { getDictionary, template } from "../lib/i18n/get-dictionary";
import { INTL_LOCALE } from "../lib/i18n/locales";
import { renderTerms } from "../lib/i18n/terms";
import { UsageAnalyticsView } from "./usage-analytics";

const dict = getDictionary("en");
const labels = dict.analytics;

describe("UsageAnalyticsView", () => {
  it("renders accessible UTC usage data and escapes client labels", () => {
    const html = renderToStaticMarkup(
      createElement(UsageAnalyticsView, {
        analytics: analytics(),
        locale: "en",
        dict,
        day: null,
        range: "30d",
        rangePath: "/activity",
      }),
    );

    expect(html).toContain(labels.dailyBrainUsage);
    expect(html).toContain(template(labels.cellCallsMany, { date: "Sep 1, 2026", count: 3 }));
    expect(html).toContain(template(labels.cellNotTracked, { date: "Sep 2, 2025" }));
    expect(html).toContain(labels.topClients);
    expect(html).toContain(labels.teamLeaderboard);
    expect(html).toContain(template(labels.writesPromotedOne, { count: 1 }));
    expect(html).toContain(template(labels.memberMetaIdle, { role: labels.roleMember }));
    expect(html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(html).toContain(labels.recentToolCalls);
    expect(html).toContain("&lt;script&gt;client&lt;/script&gt;");
    expect(html).not.toContain("<script>client</script>");
  });

  it("names and outlines a selected UTC day", () => {
    const html = renderToStaticMarkup(
      createElement(UsageAnalyticsView, {
        analytics: analytics(),
        locale: "en",
        dict,
        day: "2026-09-01",
        range: "30d",
        rangePath: "/activity",
      }),
    );

    expect(html).toContain(`${labels.successfulCalls} · Sep 1, 2026${labels.utcSuffix}`);
    expect(html).toContain("ring-2 ring-ink");
  });
  it.each(["tr", "zh"] as const)(
    "renders %s labels, roles, UTC dates, weekdays and counts",
    (locale) => {
      const dict = getDictionary(locale);
      const labels = dict.analytics;
      const data = analytics();
      data.totals.calls = 1234;
      const html = renderToStaticMarkup(
        createElement(UsageAnalyticsView, {
          analytics: data,
          locale,
          dict,
          day: "2026-09-01",
          range: "30d",
          rangePath: "/activity",
        }),
      );
      expect(html).toContain(labels.activeClients);
      expect(html).toContain(renderToStaticMarkup(renderTerms(labels.activeBrains)));
      expect(html).toContain((1234).toLocaleString(INTL_LOCALE[locale]));
      expect(html).toContain(
        template(labels.memberMeta, {
          role: labels.roleOwner,
          writes: template(labels.writesPromotedOne, { count: 1 }),
          time: relativeTime("2026-09-01T12:00:00.000Z", locale),
        }),
      );
      expect(html).toContain(template(labels.memberMetaIdle, { role: labels.roleMember }));
      const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date("2026-09-01T00:00:00.000Z"));
      expect(html).toContain(`${labels.successfulCalls} · ${date}${labels.utcSuffix}`);
      expect(html).toContain(template(labels.cellCallsMany, { date, count: 3 }));
      if (locale === "tr") {
        expect(html).toContain('Aktif <span lang="en">brain</span>');
        for (const weekday of ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]) {
          expect(html).toContain(`>${weekday}</span>`);
        }
        expect(html).not.toContain(">Fri</span>");
        expect(html).not.toContain("[[brain]]");
      }
    },
  );
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
