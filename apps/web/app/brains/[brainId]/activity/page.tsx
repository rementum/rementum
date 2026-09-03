import { BrainNav } from "../../../../components/brain-nav";
import { Chip } from "../../../../components/ui/chip";
import { EmptyState } from "../../../../components/ui/empty-state";
import { PageHeader } from "../../../../components/ui/page-header";
import { UsageAnalyticsView } from "../../../../components/usage-analytics";
import {
  parseAnalyticsDay,
  parseAnalyticsRange,
  type UsageAnalytics,
} from "../../../../lib/analytics";
import { api } from "../../../../lib/api";
import { formatDate, formatDateTime, relativeTime } from "../../../../lib/format";

interface Activity {
  id: string;
  action: string;
  resource: string;
  actorId: string;
  clientId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ brainId: string }>;
  searchParams: Promise<{ range?: string | string[]; day?: string | string[] }>;
}) {
  const { brainId } = await params;
  const query = await searchParams;
  const range = parseAnalyticsRange(query.range);
  const selectedDay = parseAnalyticsDay(query.day);
  const brain = await api<{ brain: { name: string; workspaceId: string } }>(
    `/api/v1/brains/${brainId}`,
  );
  const [analytics, activity] = await Promise.all([
    api<UsageAnalytics>(
      `/api/v1/workspaces/${brain.brain.workspaceId}/analytics?range=${range}&brainId=${brainId}${selectedDay ? `&day=${selectedDay}` : ""}`,
    ),
    api<Activity[]>(`/api/v1/brains/${brainId}/activity?limit=200`),
  ]);
  const days: Array<{ day: string; events: Activity[] }> = [];
  for (const event of activity) {
    const day = formatDate(event.createdAt);
    const group = days.at(-1);
    if (group && group.day === day) group.events.push(event);
    else days.push({ day, events: [event] });
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
      <PageHeader
        kicker={brain.brain.name}
        title="Activity"
        description="MCP usage intensity and the detailed audit trail for this brain."
      />
      <div className="mt-6">
        <BrainNav brainId={brainId} />
      </div>
      <section className="mt-8">
        <UsageAnalyticsView
          analytics={analytics}
          brainScoped
          day={selectedDay}
          range={range}
          rangePath={`/brains/${brainId}/activity`}
          showLeaderboards={false}
          showRecentCalls={false}
        />
      </section>
      <section className="mt-10" aria-labelledby="brain-audit-title">
        <h2
          className="mb-3 font-mono font-semibold text-2xs text-ink-3 uppercase tracking-[0.08em]"
          id="brain-audit-title"
        >
          Detailed audit trail
        </h2>
        {days.length ? (
          days.map((group) => (
            <div key={group.day}>
              <div className="sticky top-14 z-10 border-line border-b border-dashed bg-page/90 py-2 backdrop-blur md:top-0">
                <span className="font-mono font-semibold text-2xs text-ink-3 uppercase tracking-[0.08em]">
                  {group.day}
                </span>
              </div>
              <div className="divide-y divide-line">
                {group.events.map((event) => (
                  <article className="flex items-center gap-4 py-2.5" key={event.id}>
                    <time
                      className="w-16 shrink-0 font-mono text-2xs text-ink-3 tabular-nums"
                      dateTime={event.createdAt}
                      title={formatDateTime(event.createdAt)}
                    >
                      {relativeTime(event.createdAt)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink text-sm">{event.action}</p>
                      <p className="truncate font-mono text-2xs text-ink-3">{event.resource}</p>
                    </div>
                    <Chip className="shrink-0">{event.clientId ?? "web"}</Chip>
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No activity yet." body="Connected agents will appear here." />
        )}
      </section>
    </main>
  );
}
