export const ANALYTICS_RANGES = ["7d", "30d", "90d", "365d"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

// The API validates this shape from @rementum/contracts. The web image is intentionally
// standalone and does not copy workspace packages, so keep its erased TypeScript view local.
export interface UsageAnalytics {
  scope: { workspaceId: string; brainId: string | null };
  trackingStartedAt: string;
  generatedAt: string;
  timeZone: "UTC";
  range: AnalyticsRange;
  totals: {
    calls: number;
    activeClients: number;
    activeBrains: number;
    articlesConsumed: number;
  };
  daily: Array<{ date: string; calls: number; tracked: boolean }>;
  topClients: Array<{
    name: string;
    calls: number;
    registrations: number;
    lastUsedAt: string;
  }>;
  topBrains: Array<{ id: string; name: string; calls: number; lastUsedAt: string }>;
  topArticles: Array<{
    id: string;
    brainId: string;
    brainName: string;
    title: string;
    uses: number;
    lastUsedAt: string;
  }>;
  topTools: Array<{ tool: string; calls: number; lastUsedAt: string }>;
  recentCalls: Array<{
    id: string;
    tool: string;
    clientName: string;
    brainId: string | null;
    brainName: string | null;
    createdAt: string;
  }>;
}

export interface HeatmapCell {
  key: string;
  date: string | null;
  calls: number;
  tracked: boolean;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapModel {
  cells: HeatmapCell[];
  months: Array<{ column: number; label: string }>;
}

const monthFormat = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return ANALYTICS_RANGES.includes(candidate as AnalyticsRange)
    ? (candidate as AnalyticsRange)
    : "30d";
}

export function buildHeatmap(daily: UsageAnalytics["daily"]): HeatmapModel {
  if (!daily.length) return { cells: [], months: [] };
  const values = [
    ...new Set(daily.filter((day) => day.tracked && day.calls > 0).map((day) => day.calls)),
  ].sort((left, right) => left - right);
  const firstDay = new Date(`${daily[0]?.date}T00:00:00.000Z`).getUTCDay();
  const cells: HeatmapCell[] = Array.from({ length: firstDay }, (_, index) => ({
    key: `leading-${index}`,
    date: null,
    calls: 0,
    tracked: false,
    level: 0,
  }));
  for (const day of daily) {
    cells.push({
      key: day.date,
      ...day,
      level: day.tracked ? usageLevel(day.calls, values) : 0,
    });
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let index = 0; index < trailing; index += 1) {
    cells.push({ key: `trailing-${index}`, date: null, calls: 0, tracked: false, level: 0 });
  }
  const months: HeatmapModel["months"] = [];
  for (let index = 0; index < cells.length; index += 1) {
    const date = cells[index]?.date;
    if (!date?.endsWith("-01")) continue;
    months.push({
      column: Math.floor(index / 7) + 1,
      label: monthFormat.format(new Date(`${date}T00:00:00.000Z`)),
    });
  }
  return { cells, months };
}

function usageLevel(calls: number, values: number[]): 0 | 1 | 2 | 3 | 4 {
  if (calls < 1 || !values.length) return 0;
  if (values.length === 1) return 4;
  const rank = values.indexOf(calls);
  return (1 + Math.floor((Math.max(rank, 0) * 3) / (values.length - 1))) as 1 | 2 | 3 | 4;
}
