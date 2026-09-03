import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HeatmapCell } from "../lib/analytics";
import { HeatmapGrid } from "./heatmap-grid";

describe("HeatmapGrid", () => {
  it("renders tracked, untracked, and padding cells with accessible labels and attributes", () => {
    const cells: HeatmapCell[] = [
      { key: "leading-0", date: null, calls: 0, tracked: false, level: 0 },
      { key: "2026-09-01", date: "2026-09-01", calls: 0, tracked: false, level: 0 },
      { key: "2026-09-02", date: "2026-09-02", calls: 1, tracked: true, level: 1 },
      { key: "2026-09-03", date: "2026-09-03", calls: 42, tracked: true, level: 4 },
    ];

    const html = renderToStaticMarkup(
      createElement(HeatmapGrid, {
        cells,
        columnTemplate: "repeat(4, minmax(10px, 1fr))",
        basePath: "/activity",
        range: "30d",
        selectedDay: "2026-09-03",
      }),
    );

    // Padding cell is aria-hidden and carries no label or role
    expect(html).toContain('<span aria-hidden="true" class="h-3"></span>');

    // Untracked cell renders as an outlined box with role="img"
    expect(html).toContain('aria-label="Sep 1, 2026: not tracked"');
    expect(html).toContain('data-label="Sep 1, 2026: not tracked"');
    expect(html).toContain("ring-1 ring-line ring-inset");
    expect(html).toContain('role="img"');

    // Tracked cells render as links with day drilldown hrefs
    expect(html).toContain('aria-label="Sep 2, 2026: 1 successful MCP call"');
    expect(html).toContain('data-label="Sep 2, 2026: 1 successful MCP call"');
    expect(html).toContain('href="/activity?range=30d&amp;day=2026-09-02"');
    expect(html).toContain("bg-green/20");

    // Selected cell links back without day, has selection ring and aria-current
    expect(html).toContain('aria-label="Sep 3, 2026: 42 successful MCP calls"');
    expect(html).toContain('data-label="Sep 3, 2026: 42 successful MCP calls"');
    expect(html).toContain('href="/activity?range=30d"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("ring-2 ring-ink");
    expect(html).toContain("bg-green");

    // Tooltip is not rendered in initial static markup
    expect(html).not.toContain("shadow-overlay");
  });
});
