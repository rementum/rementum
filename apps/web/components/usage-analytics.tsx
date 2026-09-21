import Link from "next/link";
import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
  buildHeatmap,
  heatLevels,
  type UsageAnalytics,
} from "../lib/analytics";
import { relativeTime } from "../lib/format";
import { type Dictionary, template } from "../lib/i18n/get-dictionary";
import { INTL_LOCALE, type Locale } from "../lib/i18n/locales";
import { renderTerms } from "../lib/i18n/terms";
import { HeatmapGrid } from "./heatmap-grid";
import { Card, CardHeader } from "./ui/card";
import { Chip } from "./ui/chip";

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

const RANGE_LABELS: Record<AnalyticsRange, keyof Dictionary["analytics"]> = {
  "7d": "range7Days",
  "30d": "range30Days",
  "90d": "range90Days",
  "365d": "range1Year",
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
  locale,
  dict,
  range,
  rangePath,
  day,
  brainScoped = false,
  showLeaderboards = true,
  showRecentCalls = true,
}: {
  analytics: UsageAnalytics;
  locale: Locale;
  dict: Dictionary;
  range: AnalyticsRange;
  rangePath: string;
  day: string | null;
  brainScoped?: boolean;
  showLeaderboards?: boolean;
  showRecentCalls?: boolean;
}) {
  const labels = dict.analytics;
  const activeDays = day
    ? analytics.daily.some((entry) => entry.date === day && entry.tracked && entry.calls > 0)
      ? 1
      : 0
    : analytics.daily.slice(-RANGE_DAYS[range]).filter((entry) => entry.tracked && entry.calls > 0)
        .length;
  const metrics = [
    { label: labels.mcpCalls, value: analytics.totals.calls },
    { label: labels.activeClients, value: analytics.totals.activeClients },
    brainScoped
      ? { label: labels.activeDays, value: activeDays }
      : { label: labels.activeBrains, value: analytics.totals.activeBrains },
    { label: labels.articlesUsed, value: analytics.totals.articlesConsumed },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-mono text-2xs text-ink-3 uppercase tracking-[0.1em]">
          {labels.successfulCalls}
          {day
            ? ` · ${analyticsFormats(locale).date.format(new Date(`${day}T00:00:00.000Z`))}`
            : null}
          {labels.utcSuffix}
        </p>
        <RangePicker path={rangePath} selected={range} labels={labels} />
      </div>

      <Card>
        <dl className="grid divide-y divide-dashed divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div className="relative overflow-hidden px-5 py-4" key={metric.label}>
              <dt className="font-mono text-[10.5px] text-ink-3 uppercase tracking-[0.12em]">
                {renderTerms(metric.label)}
              </dt>
              <dd className="mt-2 font-mono font-semibold text-3xl text-ink tabular-nums tracking-tight">
                {metric.value.toLocaleString(INTL_LOCALE[locale])}
              </dd>
              <span
                aria-hidden="true"
                className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-grad-from via-grad-mid to-transparent opacity-50"
              />
            </div>
          ))}
        </dl>
      </Card>

      <ContributionHeatmap
        analytics={analytics}
        locale={locale}
        labels={labels}
        basePath={rangePath}
        range={range}
        selectedDay={day}
      />

      {showLeaderboards ? (
        <Leaderboards analytics={analytics} locale={locale} labels={labels} />
      ) : null}
      {showRecentCalls ? (
        <RecentCalls calls={analytics.recentCalls} locale={locale} labels={labels} />
      ) : null}
    </div>
  );
}

function RangePicker({
  path,
  selected,
  labels,
}: {
  path: string;
  selected: AnalyticsRange;
  labels: Dictionary["analytics"];
}) {
  return (
    <nav
      aria-label={labels.analyticsRange}
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
          {labels[RANGE_LABELS[range]]}
        </Link>
      ))}
    </nav>
  );
}

function ContributionHeatmap({
  analytics,
  locale,
  labels,
  basePath,
  range,
  selectedDay,
}: {
  analytics: UsageAnalytics;
  locale: Locale;
  labels: Dictionary["analytics"];
  basePath: string;
  range: AnalyticsRange;
  selectedDay: string | null;
}) {
  const heatmap = buildHeatmap(analytics.daily, locale);
  const columns = Math.max(1, Math.ceil(heatmap.cells.length / 7));
  const columnTemplate = `repeat(${columns}, minmax(10px, 1fr))`;

  return (
    <Card>
      <CardHeader
        title={labels.dailyBrainUsage}
        count={labels.rolling365Days}
        action={
          <span className="font-mono text-[10px] text-ink-3 uppercase tracking-[0.08em]">
            {labels.utc}
          </span>
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
                {Array.from({ length: 7 }, (_, index) =>
                  analyticsFormats(locale).weekday.format(new Date(Date.UTC(2026, 0, 4 + index))),
                ).map((day) => (
                  <span
                    className="flex h-3 items-center font-mono text-[8px] text-ink-3 uppercase"
                    key={day}
                  >
                    {day}
                  </span>
                ))}
              </div>
              <HeatmapGrid
                locale={locale}
                labels={{
                  cellCallsOne: labels.cellCallsOne,
                  cellCallsMany: labels.cellCallsMany,
                  cellNotTracked: labels.cellNotTracked,
                }}
                basePath={basePath}
                cells={heatmap.cells}
                columnTemplate={columnTemplate}
                range={range}
                selectedDay={selectedDay}
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-line border-t border-dashed pt-3">
          <p className="text-ink-2 text-xs">{labels.heatmapNote}</p>
          <div className="flex items-center gap-1.5 font-mono text-[9px] text-ink-3 uppercase">
            <span>{labels.less}</span>
            {heatLevels.map((level) => (
              <span className={`size-3 rounded-[2px] ${level}`} key={level} />
            ))}
            <span>{labels.more}</span>
            <span className="ml-2 size-3 rounded-[2px] ring-1 ring-line ring-inset" />
            <span>{labels.notTracked}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Leaderboards({
  analytics,
  locale,
  labels,
}: {
  analytics: UsageAnalytics;
  locale: Locale;
  labels: Dictionary["analytics"];
}) {
  const roles = { owner: labels.roleOwner, admin: labels.roleAdmin, member: labels.roleMember };
  const memberItems: RankItem[] = analytics.topMembers.map((member) => ({
    key: member.userId,
    label: member.name,
    value: member.actions,
    meta: member.lastActiveAt
      ? template(labels.memberMeta, {
          role: roles[member.role],
          writes: template(
            member.writes === 1 ? labels.writesPromotedOne : labels.writesPromotedMany,
            { count: member.writes.toLocaleString(INTL_LOCALE[locale]) },
          ),
          time: relativeTime(member.lastActiveAt, locale),
        })
      : template(labels.memberMetaIdle, { role: roles[member.role] }),
  }));
  const clientItems: RankItem[] = analytics.topClients.map((client) => ({
    key: client.name,
    label: client.name,
    value: client.calls,
    meta: template(labels.clientMeta, {
      registrations: template(
        client.registrations === 1 ? labels.registrationsOne : labels.registrationsMany,
        { count: client.registrations.toLocaleString(INTL_LOCALE[locale]) },
      ),
      time: relativeTime(client.lastUsedAt, locale),
    }),
  }));
  const brainItems: RankItem[] = analytics.topBrains.map((brain) => ({
    key: brain.id,
    label: brain.name,
    value: brain.calls,
    meta: template(labels.lastUsed, { time: relativeTime(brain.lastUsedAt, locale) }),
    href: `/brains/${brain.id}/activity`,
  }));
  const articleItems: RankItem[] = analytics.topArticles.map((article) => ({
    key: article.id,
    label: article.title,
    value: article.uses,
    meta: template(labels.articleMeta, {
      brain: article.brainName,
      time: relativeTime(article.lastUsedAt, locale),
    }),
    href: `/articles/${article.id}`,
  }));
  const toolItems: RankItem[] = analytics.topTools.map((tool) => ({
    key: tool.tool,
    label: tool.tool,
    value: tool.calls,
    meta: template(labels.lastUsed, { time: relativeTime(tool.lastUsedAt, locale) }),
  }));
  return (
    <section className="grid gap-5 lg:grid-cols-2" aria-label={labels.usageRankings}>
      <RankedCard
        locale={locale}
        emptyLabel={labels.noUsage}
        className="lg:col-span-2"
        items={memberItems}
        title={labels.teamLeaderboard}
        valueLabel={labels.actions}
      />
      <RankedCard
        locale={locale}
        emptyLabel={labels.noUsage}
        items={clientItems}
        title={labels.topClients}
        valueLabel={labels.calls}
      />
      <RankedCard
        locale={locale}
        emptyLabel={labels.noUsage}
        items={brainItems}
        title={labels.topBrains}
        valueLabel={labels.calls}
      />
      <RankedCard
        locale={locale}
        emptyLabel={labels.noUsage}
        items={articleItems}
        title={labels.topArticles}
        valueLabel={labels.uses}
      />
      <RankedCard
        locale={locale}
        emptyLabel={labels.noUsage}
        items={toolItems}
        title={labels.topTools}
        valueLabel={labels.calls}
        mono
      />
    </section>
  );
}

function RankedCard({
  title,
  locale,
  emptyLabel,
  items,
  valueLabel,
  mono = false,
  className,
}: {
  title: string;
  locale: Locale;
  emptyLabel: string;
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
                  {item.value.toLocaleString(INTL_LOCALE[locale])}
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
        <p className="px-4 py-8 text-center text-ink-3 text-sm">{emptyLabel}</p>
      )}
    </Card>
  );
}

function RecentCalls({
  calls,
  locale,
  labels,
}: {
  calls: UsageAnalytics["recentCalls"];
  locale: Locale;
  labels: Dictionary["analytics"];
}) {
  return (
    <Card>
      <CardHeader title={labels.recentToolCalls} count={calls.length || undefined} />
      {calls.length ? (
        <div className="divide-y divide-line">
          {calls.map((call) => (
            <article className="flex items-center gap-4 px-4 py-2.5" key={call.id}>
              <time
                className="w-16 shrink-0 font-mono text-2xs text-ink-3 tabular-nums"
                dateTime={call.createdAt}
                title={`${analyticsFormats(locale).dateTime.format(new Date(call.createdAt))} ${labels.utc}`}
              >
                {relativeTime(call.createdAt, locale)}
              </time>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium font-mono text-ink text-sm">{call.tool}</p>
                <p className="truncate text-2xs text-ink-3">
                  {call.brainName ?? (call.brainId ? labels.deletedBrain : labels.workspaceWide)}
                </p>
              </div>
              <Chip className="max-w-48 shrink-0">
                <span className="truncate">{call.clientName}</span>
              </Chip>
            </article>
          ))}
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-ink-3 text-sm">{labels.noRecentCalls}</p>
      )}
    </Card>
  );
}

const formats = new Map<
  Locale,
  { date: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat; weekday: Intl.DateTimeFormat }
>();

function analyticsFormats(locale: Locale) {
  let cached = formats.get(locale);
  if (!cached) {
    cached = {
      date: new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeZone: "UTC" }),
      dateTime: new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
      weekday: new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "short", timeZone: "UTC" }),
    };
    formats.set(locale, cached);
  }
  return cached;
}
