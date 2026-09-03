import Link from "next/link";
import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
  buildHeatmap,
  heatLevels,
  type UsageAnalytics,
} from "../lib/analytics";
import { relativeTime } from "../lib/format";
import { HeatmapGrid } from "./heatmap-grid";
import { Card, CardHeader } from "./ui/card";
import { Chip } from "./ui/chip";

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "365d": "1 year",
};

interface RankItem {
  key: string;
  label: string;
  value: number;
  meta: string;
  href?: string;
}

export function UsageAnalyticsView({
  analytics,
  range,
  rangePath,
  brainScoped = false,
  showLeaderboards = true,
  showRecentCalls = true,
}: {
  analytics: UsageAnalytics;
  range: AnalyticsRange;
  rangePath: string;
  brainScoped?: boolean;
  showLeaderboards?: boolean;
  showRecentCalls?: boolean;
}) {
  const activeDays = analytics.daily
    .slice(-RANGE_DAYS[range])
    .filter((day) => day.tracked && day.calls > 0).length;
  const metrics = [
    { label: "MCP calls", value: analytics.totals.calls },
    { label: "Active clients", value: analytics.totals.activeClients },
    brainScoped
      ? { label: "Active days", value: activeDays }
      : { label: "Active brains", value: analytics.totals.activeBrains },
    { label: "Articles used", value: analytics.totals.articlesConsumed },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-mono text-2xs text-ink-3 uppercase tracking-[0.1em]">
          Successful MCP tool calls · UTC
        </p>
        <RangePicker path={rangePath} selected={range} />
      </div>

      <Card>
        <dl className="grid divide-y divide-dashed divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div className="relative overflow-hidden px-5 py-4" key={metric.label}>
              <dt className="font-mono text-[10.5px] text-ink-3 uppercase tracking-[0.12em]">
                {metric.label}
              </dt>
              <dd className="mt-2 font-mono font-semibold text-3xl text-ink tabular-nums tracking-tight">
                {metric.value.toLocaleString("en")}
              </dd>
              <span
                aria-hidden="true"
                className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-grad-from via-grad-mid to-transparent opacity-50"
              />
            </div>
          ))}
        </dl>
      </Card>

      <ContributionHeatmap analytics={analytics} />

      {showLeaderboards ? <Leaderboards analytics={analytics} /> : null}
      {showRecentCalls ? <RecentCalls calls={analytics.recentCalls} /> : null}
    </div>
  );
}

function RangePicker({ path, selected }: { path: string; selected: AnalyticsRange }) {
  return (
    <nav
      aria-label="Analytics range"
      className="flex rounded-control border border-line bg-surface p-1 shadow-btn"
    >
      {ANALYTICS_RANGES.map((range) => (
        <Link
          aria-current={range === selected ? "page" : undefined}
          className={`rounded-[calc(var(--radius-control)-3px)] px-3 py-1.5 font-mono text-2xs transition-colors focus-visible:outline-2 focus-visible:outline-green focus-visible:outline-offset-2 ${
            range === selected ? "bg-ink text-page" : "text-ink-3 hover:bg-hover hover:text-ink"
          }`}
          href={`${path}?range=${range}`}
          key={range}
        >
          {RANGE_LABELS[range]}
        </Link>
      ))}
    </nav>
  );
}

function ContributionHeatmap({ analytics }: { analytics: UsageAnalytics }) {
  const heatmap = buildHeatmap(analytics.daily);
  const columns = Math.max(1, Math.ceil(heatmap.cells.length / 7));
  const columnTemplate = `repeat(${columns}, minmax(10px, 1fr))`;

  return (
    <Card>
      <CardHeader
        title="Daily brain usage"
        count="Rolling 365 days"
        action={
          <span className="font-mono text-[10px] text-ink-3 uppercase tracking-[0.08em]">UTC</span>
        }
      />
      <div className="p-4 sm:p-5">
        <div className="overflow-x-auto pb-2">
          {/* The month labels are wider than their ~15px grid track, so the last one spills past
              the grid's right edge and gives the scrollport a pixel of travel. The padding absorbs
              it; the scrollbar stays for the narrow viewports that genuinely need it. */}
          <div className="min-w-[680px] pr-3">
            <div className="ml-9 grid h-5 gap-1" style={{ gridTemplateColumns: columnTemplate }}>
              {heatmap.months.map((month) => (
                <span
                  className="font-mono text-[9px] text-ink-3 uppercase"
                  key={`${month.column}-${month.label}`}
                  style={{ gridColumnStart: month.column }}
                >
                  {month.label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-[28px_1fr] gap-2">
              <div className="grid grid-rows-7 gap-1" aria-hidden="true">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <span
                    className="flex h-3 items-center font-mono text-[8px] text-ink-3 uppercase"
                    key={day}
                  >
                    {day}
                  </span>
                ))}
              </div>
              <HeatmapGrid cells={heatmap.cells} columnTemplate={columnTemplate} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-line border-t border-dashed pt-3">
          <p className="text-ink-2 text-xs">
            Each square counts completed tool calls, not internal audit reads.
          </p>
          <div className="flex items-center gap-1.5 font-mono text-[9px] text-ink-3 uppercase">
            <span>Less</span>
            {heatLevels.map((level) => (
              <span className={`size-3 rounded-[2px] ${level}`} key={level} />
            ))}
            <span>More</span>
            <span
              className="ml-2 size-3 rounded-[2px]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent, transparent 2px, var(--line) 2px, var(--line) 3px)",
              }}
            />
            <span>Not tracked</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Leaderboards({ analytics }: { analytics: UsageAnalytics }) {
  const memberItems: RankItem[] = analytics.topMembers.map((member) => ({
    key: member.userId,
    label: member.name,
    value: member.actions,
    meta: member.lastActiveAt
      ? `${member.role} · ${member.writes} ${member.writes === 1 ? "write" : "writes"} promoted · Last active ${relativeTime(member.lastActiveAt)}`
      : `${member.role} · No activity in this range`,
  }));
  const clientItems: RankItem[] = analytics.topClients.map((client) => ({
    key: client.name,
    label: client.name,
    value: client.calls,
    meta: `${client.registrations} ${client.registrations === 1 ? "registration" : "registrations"} · ${relativeTime(client.lastUsedAt)}`,
  }));
  const brainItems: RankItem[] = analytics.topBrains.map((brain) => ({
    key: brain.id,
    label: brain.name,
    value: brain.calls,
    meta: `Last used ${relativeTime(brain.lastUsedAt)}`,
    href: `/brains/${brain.id}/activity`,
  }));
  const articleItems: RankItem[] = analytics.topArticles.map((article) => ({
    key: article.id,
    label: article.title,
    value: article.uses,
    meta: `${article.brainName} · ${relativeTime(article.lastUsedAt)}`,
    href: `/articles/${article.id}`,
  }));
  const toolItems: RankItem[] = analytics.topTools.map((tool) => ({
    key: tool.tool,
    label: tool.tool,
    value: tool.calls,
    meta: `Last used ${relativeTime(tool.lastUsedAt)}`,
  }));
  return (
    <section className="grid gap-5 lg:grid-cols-2" aria-label="Usage rankings">
      <RankedCard
        className="lg:col-span-2"
        items={memberItems}
        title="Team leaderboard"
        valueLabel="actions"
      />
      <RankedCard items={clientItems} title="Top clients" valueLabel="calls" />
      <RankedCard items={brainItems} title="Top brains" valueLabel="calls" />
      <RankedCard items={articleItems} title="Top articles" valueLabel="uses" />
      <RankedCard items={toolItems} title="Top tools" valueLabel="calls" mono />
    </section>
  );
}

function RankedCard({
  title,
  items,
  valueLabel,
  mono = false,
  className,
}: {
  title: string;
  items: RankItem[];
  valueLabel: string;
  mono?: boolean;
  className?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <Card className={className}>
      <CardHeader title={title} count={items.length || undefined} />
      {items.length ? (
        <ol className="divide-y divide-line">
          {items.map((item, index) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-green/[0.07]"
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
                <span className="relative w-6 shrink-0 font-mono text-2xs text-ink-3 tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span
                    className={`block truncate font-medium text-ink text-sm ${mono ? "font-mono" : ""}`}
                  >
                    {item.label}
                  </span>
                  <span className="block truncate text-2xs text-ink-3">{item.meta}</span>
                </span>
                <span className="relative shrink-0 text-right font-mono font-semibold text-ink text-sm tabular-nums">
                  {item.value.toLocaleString("en")}
                  <span className="ml-1 font-normal text-[9px] text-ink-3 uppercase">
                    {valueLabel}
                  </span>
                </span>
              </>
            );
            return (
              <li className="relative overflow-hidden" key={item.key}>
                {item.href ? (
                  <Link
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover/60"
                    href={item.href}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-4 py-8 text-center text-ink-3 text-sm">No usage in this range.</p>
      )}
    </Card>
  );
}

function RecentCalls({ calls }: { calls: UsageAnalytics["recentCalls"] }) {
  return (
    <Card>
      <CardHeader title="Recent tool calls" count={calls.length || undefined} />
      {calls.length ? (
        <div className="divide-y divide-line">
          {calls.map((call) => (
            <article className="flex items-center gap-4 px-4 py-2.5" key={call.id}>
              <time
                className="w-16 shrink-0 font-mono text-2xs text-ink-3 tabular-nums"
                dateTime={call.createdAt}
                title={`${utcDateTimeFormat.format(new Date(call.createdAt))} UTC`}
              >
                {relativeTime(call.createdAt)}
              </time>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium font-mono text-ink text-sm">{call.tool}</p>
                <p className="truncate text-2xs text-ink-3">
                  {call.brainName ?? (call.brainId ? "Deleted brain" : "Workspace-wide")}
                </p>
              </div>
              <Chip className="max-w-48 shrink-0">
                <span className="truncate">{call.clientName}</span>
              </Chip>
            </article>
          ))}
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-ink-3 text-sm">
          Successful MCP tool calls will appear here.
        </p>
      )}
    </Card>
  );
}

const utcDateTimeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
