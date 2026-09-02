import type { ReactNode } from "react";
import { buildBars, formatBytes, type InstanceOverview } from "../lib/admin";
import { Card, CardHeader } from "./ui/card";

interface Fact {
  label: string;
  value: number | string;
  hint?: string;
  attention?: boolean;
}

export function InstanceOverviewView({ overview }: { overview: InstanceOverview }) {
  const { accounts, knowledge, usage, compaction, storage } = overview;
  const headline = [
    { label: "Accounts", value: accounts.total },
    { label: "Active · 7 days", value: accounts.activeLast7Days },
    { label: "Brains", value: knowledge.brains },
    { label: "MCP calls · 30 days", value: usage.mcpCallsLast30Days },
  ];
  const accountFacts: Fact[] = [
    { label: "Verified", value: accounts.verified },
    {
      label: "Awaiting verification",
      value: accounts.unverified,
      attention: accounts.unverified > 0,
    },
    { label: "Disabled", value: accounts.disabled },
    { label: "Instance owners", value: accounts.systemOwners },
    { label: "New in the last 7 days", value: accounts.newLast7Days },
    { label: "New in the last 30 days", value: accounts.newLast30Days },
    { label: "Active in the last 30 days", value: accounts.activeLast30Days },
  ];
  const knowledgeFacts: Fact[] = [
    { label: "Teams", value: knowledge.teams },
    { label: "Workspaces", value: knowledge.workspaces },
    { label: "Brains", value: knowledge.brains },
    { label: "Articles", value: knowledge.articles },
    { label: "Versions in history", value: knowledge.versions },
    { label: "Writes awaiting review", value: knowledge.pendingWrites },
    {
      label: "Writes in conflict",
      value: knowledge.conflictedWrites,
      attention: knowledge.conflictedWrites > 0,
    },
    { label: "Open tasks", value: knowledge.openTasks },
    { label: "Claimed tasks", value: knowledge.claimedTasks },
  ];
  const usageFacts: Fact[] = [
    { label: "MCP calls · 24 hours", value: usage.mcpCallsLast24Hours },
    { label: "MCP calls · 7 days", value: usage.mcpCallsLast7Days },
    { label: "MCP calls · all time", value: usage.mcpCallsTotal },
    { label: "Agent clients · 30 days", value: usage.activeClientsLast30Days },
    { label: "Live MCP connections", value: usage.mcpConnections, hint: "OAuth grants" },
    { label: "Live browser sessions", value: usage.webSessions },
  ];
  const systemFacts: Fact[] = [
    { label: "Database size", value: formatBytes(storage.databaseBytes) },
    { label: "Compaction queued", value: compaction.queued },
    { label: "Compaction in progress", value: compaction.processing },
    {
      label: "Compaction failed",
      value: compaction.failed,
      attention: compaction.failed > 0,
      hint: "The submitted body stays canonical",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-mono text-2xs text-ink-3 uppercase tracking-[0.1em]">
          Every team on this instance · UTC
        </p>
        <p className="font-mono text-2xs text-ink-3">
          Generated{" "}
          <time dateTime={overview.generatedAt}>{utcDateTime(overview.generatedAt)} UTC</time>
        </p>
      </div>

      <Card>
        <dl className="grid divide-y divide-dashed divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {headline.map((metric) => (
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

      <section className="grid gap-5 lg:grid-cols-2" aria-label="Last 30 days">
        <DailyBars
          title="New accounts"
          daily={overview.daily}
          series="signups"
          unit={["sign-up", "sign-ups"]}
        />
        <DailyBars
          title="MCP tool calls"
          daily={overview.daily}
          series="calls"
          unit={["call", "calls"]}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2" aria-label="Instance facts">
        <FactCard title="Accounts" facts={accountFacts} />
        <FactCard title="Knowledge" facts={knowledgeFacts} />
        <FactCard title="Agents and sessions" facts={usageFacts} />
        <FactCard title="Storage and compaction" facts={systemFacts} />
      </section>
    </div>
  );
}

// One series per chart, so the bars carry no identity and need no legend: the title
// names them and each bar names its own day. Bars are scaled against the busiest day.
function DailyBars({
  title,
  daily,
  series,
  unit,
}: {
  title: string;
  daily: InstanceOverview["daily"];
  series: "signups" | "calls";
  unit: [singular: string, plural: string];
}) {
  const { bars, total, peak } = buildBars(daily, series);
  const first = bars[0]?.date;
  const last = bars.at(-1)?.date;
  return (
    <Card>
      <CardHeader
        title={title}
        count="Last 30 days"
        action={
          <span className="font-mono text-[10px] text-ink-3 uppercase tracking-[0.08em]">
            {total.toLocaleString("en")} total
          </span>
        }
      />
      <div className="p-4 sm:p-5">
        <ol className="flex h-28 items-end gap-[2px]" aria-label={`${title} per day`}>
          {bars.map((bar) => {
            const label = `${utcDate(bar.date)}: ${bar.value.toLocaleString("en")} ${
              bar.value === 1 ? unit[0] : unit[1]
            }`;
            return (
              <li className="flex h-full flex-1 items-end" key={bar.date}>
                <span
                  aria-label={label}
                  className={`block w-full rounded-t-[3px] ${
                    bar.value > 0 ? "bg-green/75 transition-colors hover:bg-green" : "bg-hover"
                  }`}
                  role="img"
                  style={{ height: bar.value > 0 ? `${Math.max(bar.ratio * 100, 4)}%` : "2px" }}
                  title={label}
                />
              </li>
            );
          })}
        </ol>
        <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-ink-3 uppercase">
          <span>{first ? utcDate(first) : ""}</span>
          <span>Peak {peak.toLocaleString("en")}</span>
          <span>{last ? utcDate(last) : ""}</span>
        </div>
      </div>
    </Card>
  );
}

function FactCard({ title, facts }: { title: ReactNode; facts: Fact[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <dl className="divide-y divide-line">
        {facts.map((fact) => (
          <div className="flex items-baseline gap-4 px-4 py-2.5" key={fact.label}>
            <dt className="min-w-0 flex-1 text-ink-2 text-sm">
              {fact.label}
              {fact.hint ? (
                <span className="ml-2 font-mono text-[10px] text-ink-3 uppercase tracking-[0.06em]">
                  {fact.hint}
                </span>
              ) : null}
            </dt>
            <dd
              className={`shrink-0 font-mono font-semibold text-sm tabular-nums ${
                fact.attention ? "text-orange" : "text-ink"
              }`}
            >
              {typeof fact.value === "number" ? fact.value.toLocaleString("en") : fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const utcDateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const utcDateTimeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function utcDate(value: string) {
  return utcDateFormat.format(new Date(`${value}T00:00:00.000Z`));
}

function utcDateTime(value: string) {
  return utcDateTimeFormat.format(new Date(value));
}
