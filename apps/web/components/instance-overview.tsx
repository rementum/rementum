import type { ReactNode } from "react";
import { buildBars, formatBytes, type InstanceOverview } from "../lib/admin";
import { type Dictionary, template } from "../lib/i18n/get-dictionary";
import { INTL_LOCALE, type Locale } from "../lib/i18n/locales";
import { renderTerms } from "../lib/i18n/terms";
import { Card, CardHeader } from "./ui/card";

interface Fact {
  label: string;
  value: number | string;
  hint?: string;
  attention?: boolean;
}

export function InstanceOverviewView({
  overview,
  locale,
  strings,
}: {
  overview: InstanceOverview;
  locale: Locale;
  strings: Dictionary["admin"];
}) {
  const { accounts, knowledge, usage, storage } = overview;
  const headline = [
    { label: strings.accounts, value: accounts.total },
    { label: strings.active7Days, value: accounts.activeLast7Days },
    { label: strings.brains, value: knowledge.brains },
    { label: strings.calls30Days, value: usage.mcpCallsLast30Days },
  ];
  const accountFacts: Fact[] = [
    { label: strings.verified, value: accounts.verified },
    {
      label: strings.awaitingVerification,
      value: accounts.unverified,
      attention: accounts.unverified > 0,
    },
    { label: strings.disabled, value: accounts.disabled },
    { label: strings.instanceOwners, value: accounts.systemOwners },
    { label: strings.new7Days, value: accounts.newLast7Days },
    { label: strings.new30Days, value: accounts.newLast30Days },
    { label: strings.active30Days, value: accounts.activeLast30Days },
  ];
  const knowledgeFacts: Fact[] = [
    { label: strings.teams, value: knowledge.teams },
    { label: strings.workspaces, value: knowledge.workspaces },
    { label: strings.brains, value: knowledge.brains },
    { label: strings.articles, value: knowledge.articles },
    { label: strings.versions, value: knowledge.versions },
    { label: strings.pendingWrites, value: knowledge.pendingWrites },
    {
      label: strings.conflictedWrites,
      value: knowledge.conflictedWrites,
      attention: knowledge.conflictedWrites > 0,
    },
    { label: strings.openTasks, value: knowledge.openTasks },
    { label: strings.claimedTasks, value: knowledge.claimedTasks },
  ];
  const usageFacts: Fact[] = [
    { label: strings.calls24Hours, value: usage.mcpCallsLast24Hours },
    { label: strings.calls7Days, value: usage.mcpCallsLast7Days },
    { label: strings.callsAllTime, value: usage.mcpCallsTotal },
    { label: strings.agentClients30Days, value: usage.activeClientsLast30Days },
    { label: strings.liveConnections, value: usage.mcpConnections, hint: strings.oauthGrants },
    { label: strings.liveSessions, value: usage.webSessions },
  ];
  const systemFacts: Fact[] = [
    { label: strings.databaseSize, value: formatBytes(storage.databaseBytes) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-mono text-2xs text-ink-3 uppercase tracking-[0.1em]">
          {renderTerms(strings.allTeamsUtc)}
        </p>
        <p className="font-mono text-2xs text-ink-3">
          <time dateTime={overview.generatedAt}>
            {template(strings.generatedAt, { date: utcDateTime(overview.generatedAt, locale) })}
          </time>
        </p>
      </div>

      <Card>
        <dl className="grid divide-y divide-dashed divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {headline.map((metric) => (
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

      <section className="grid gap-5 lg:grid-cols-2" aria-label={strings.last30Days}>
        <DailyBars
          locale={locale}
          strings={strings}
          title={strings.newAccounts}
          daily={overview.daily}
          series="signups"
          unit={[strings.signupsOne, strings.signupsMany]}
        />
        <DailyBars
          locale={locale}
          strings={strings}
          title={strings.mcpToolCalls}
          daily={overview.daily}
          series="calls"
          unit={[strings.callsOne, strings.callsMany]}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2" aria-label={strings.instanceFacts}>
        <FactCard locale={locale} title={strings.accounts} facts={accountFacts} />
        <FactCard locale={locale} title={strings.knowledge} facts={knowledgeFacts} />
        <FactCard locale={locale} title={strings.agentsAndSessions} facts={usageFacts} />
        <FactCard locale={locale} title={strings.storage} facts={systemFacts} />
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
  locale,
  strings,
}: {
  locale: Locale;
  strings: Dictionary["admin"];
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
        count={strings.last30Days}
        action={
          <span className="font-mono text-[10px] text-ink-3 uppercase tracking-[0.08em]">
            {renderTerms(
              template(strings.total, { count: total.toLocaleString(INTL_LOCALE[locale]) }),
            )}
          </span>
        }
      />
      <div className="p-4 sm:p-5">
        <ol
          className="flex h-28 items-end gap-[2px]"
          aria-label={template(strings.perDay, { title })}
        >
          {bars.map((bar) => {
            const label = template(bar.value === 1 ? unit[0] : unit[1], {
              date: utcDate(bar.date, locale),
              count: bar.value.toLocaleString(INTL_LOCALE[locale]),
            });
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
          <span>{first ? utcDate(first, locale) : ""}</span>
          <span>
            {renderTerms(
              template(strings.peak, { count: peak.toLocaleString(INTL_LOCALE[locale]) }),
            )}
          </span>
          <span>{last ? utcDate(last, locale) : ""}</span>
        </div>
      </div>
    </Card>
  );
}

function FactCard({ title, facts, locale }: { title: ReactNode; facts: Fact[]; locale: Locale }) {
  return (
    <Card>
      <CardHeader title={title} />
      <dl className="divide-y divide-line">
        {facts.map((fact) => (
          <div className="flex items-baseline gap-4 px-4 py-2.5" key={fact.label}>
            <dt className="min-w-0 flex-1 text-ink-2 text-sm">
              {renderTerms(fact.label)}
              {fact.hint ? (
                <span className="ml-2 font-mono text-[10px] text-ink-3 uppercase tracking-[0.06em]">
                  {renderTerms(fact.hint)}
                </span>
              ) : null}
            </dt>
            <dd
              className={`shrink-0 font-mono font-semibold text-sm tabular-nums ${
                fact.attention ? "text-orange" : "text-ink"
              }`}
            >
              {typeof fact.value === "number"
                ? fact.value.toLocaleString(INTL_LOCALE[locale])
                : fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const utcFormats = new Map<Locale, { date: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat }>();

function formats(locale: Locale) {
  let cached = utcFormats.get(locale);
  if (!cached) {
    cached = {
      date: new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeZone: "UTC" }),
      dateTime: new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    };
    utcFormats.set(locale, cached);
  }
  return cached;
}

function utcDate(value: string, locale: Locale) {
  return formats(locale).date.format(new Date(`${value}T00:00:00.000Z`));
}

function utcDateTime(value: string, locale: Locale) {
  return formats(locale).dateTime.format(new Date(value));
}
