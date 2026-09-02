// The API validates these shapes from @rementum/contracts. The web image is intentionally
// standalone and does not copy workspace packages, so keep its erased TypeScript view local.
export interface InstanceOverview {
  generatedAt: string;
  timeZone: "UTC";
  accounts: {
    total: number;
    verified: number;
    unverified: number;
    disabled: number;
    systemOwners: number;
    newLast7Days: number;
    newLast30Days: number;
    activeLast7Days: number;
    activeLast30Days: number;
  };
  knowledge: {
    teams: number;
    workspaces: number;
    brains: number;
    articles: number;
    versions: number;
    pendingWrites: number;
    conflictedWrites: number;
    openTasks: number;
    claimedTasks: number;
  };
  usage: {
    mcpCallsLast24Hours: number;
    mcpCallsLast7Days: number;
    mcpCallsLast30Days: number;
    mcpCallsTotal: number;
    activeClientsLast30Days: number;
    webSessions: number;
    mcpConnections: number;
  };
  compaction: { queued: number; processing: number; failed: number };
  storage: { databaseBytes: number };
  daily: Array<{ date: string; signups: number; calls: number }>;
}

export interface InstanceUser {
  id: string;
  email: string;
  displayName: string;
  systemOwner: boolean;
  emailVerifiedAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  teams: number;
  lastActiveAt: string | null;
  mcpConnections: number;
}

export interface InstanceUsersPage {
  items: InstanceUser[];
  total: number;
  query: string;
  limit: number;
  offset: number;
}

export const ACCOUNTS_PAGE_SIZE = 50;

export function parsePage(value: string | string[] | undefined): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const page = Number(candidate);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** The search box's value, trimmed to what the API accepts. */
export function parseQuery(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (candidate ?? "").trim().slice(0, 200);
}

export function accountsHref(query: string, page: number): string {
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  if (page > 1) search.set("page", String(page));
  const value = search.toString();
  return value ? `/admin/accounts?${value}` : "/admin/accounts";
}

export type AccountStatus = "disabled" | "unverified" | "active";

export function accountStatus(user: Pick<InstanceUser, "emailVerifiedAt" | "disabledAt">) {
  if (user.disabledAt) return "disabled";
  if (!user.emailVerifiedAt) return "unverified";
  return "active";
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1024-based, one decimal past the first unit, the way disk tools report a database. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

export interface DailyBar {
  date: string;
  value: number;
  /** Bar height as a share of the busiest day, 0 to 1. */
  ratio: number;
}

/** Scales one daily series against its own busiest day; an all-zero series stays flat. */
export function buildBars(
  daily: InstanceOverview["daily"],
  key: "signups" | "calls",
): { bars: DailyBar[]; total: number; peak: number } {
  const peak = Math.max(0, ...daily.map((day) => day[key]));
  const bars = daily.map((day) => ({
    date: day.date,
    value: day[key],
    ratio: peak > 0 ? day[key] / peak : 0,
  }));
  return { bars, total: daily.reduce((sum, day) => sum + day[key], 0), peak };
}
