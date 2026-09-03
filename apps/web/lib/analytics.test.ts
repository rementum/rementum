import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  parseAnalyticsDay,
  parseAnalyticsRange,
  type UsageAnalytics,
} from "./analytics";

describe("parseAnalyticsRange", () => {
  it("accepts allowlisted ranges and defaults invalid input", () => {
    expect(parseAnalyticsRange("7d")).toBe("7d");
    expect(parseAnalyticsRange(["90d", "7d"])).toBe("90d");
    expect(parseAnalyticsRange("all")).toBe("30d");
    expect(parseAnalyticsRange(undefined)).toBe("30d");
  });
});

describe("parseAnalyticsDay", () => {
  it("accepts real ISO calendar dates", () => {
    expect(parseAnalyticsDay("2026-09-01")).toBe("2026-09-01");
  });

  it.each([undefined, "not-a-date", "2026-13-01", "2026-02-30", ["2026-09-01", "2026-09-02"]])(
    "rejects invalid day input %#",
    (value) => {
      expect(parseAnalyticsDay(value)).toBeNull();
    },
  );
});

describe("buildHeatmap", () => {
  it("aligns 365 UTC dates into exactly 53 Sunday-first weeks", () => {
    const daily = daysEnding("2026-09-01", 365);
    const heatmap = buildHeatmap(daily);

    expect(heatmap.cells).toHaveLength(371);
    expect(heatmap.cells.slice(0, 2).every((cell) => cell.date === null)).toBe(true);
    expect(heatmap.cells.find((cell) => cell.date === "2026-09-01")).toBeTruthy();
    expect(heatmap.months.some((month) => month.label === "Sep")).toBe(true);
  });

  it("keeps untracked days distinct and assigns relative nonzero levels", () => {
    const daily: UsageAnalytics["daily"] = [
      { date: "2026-08-29", calls: 0, tracked: false },
      { date: "2026-08-30", calls: 0, tracked: true },
      { date: "2026-08-31", calls: 1, tracked: true },
      { date: "2026-09-01", calls: 10, tracked: true },
    ];
    const heatmap = buildHeatmap(daily);
    const byDate = new Map(heatmap.cells.map((cell) => [cell.date, cell]));

    expect(byDate.get("2026-08-29")).toMatchObject({ tracked: false, level: 0 });
    expect(byDate.get("2026-08-30")).toMatchObject({ tracked: true, level: 0 });
    expect(byDate.get("2026-08-31")?.level).toBe(1);
    expect(byDate.get("2026-09-01")?.level).toBe(4);
  });

  it("preserves leap day as a UTC contribution cell", () => {
    const heatmap = buildHeatmap(daysEnding("2028-03-01", 365));
    expect(heatmap.cells.some((cell) => cell.date === "2028-02-29")).toBe(true);
  });
});

function daysEnding(end: string, count: number): UsageAnalytics["daily"] {
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    return {
      date: new Date(endTime - offset * 86_400_000).toISOString().slice(0, 10),
      calls: index % 11,
      tracked: true,
    };
  });
}
