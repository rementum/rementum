import { BrainNav } from "../../../../components/brain-nav";
import { Chip } from "../../../../components/ui/chip";
import { EmptyState } from "../../../../components/ui/empty-state";
import { PageHeader } from "../../../../components/ui/page-header";
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

export default async function ActivityPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const [brain, activity] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`),
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
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={brain.brain.name} title="Activity trail" />
      <div className="mt-6">
        <BrainNav brainId={brainId} />
      </div>
      <section className="mt-8">
        {days.length ? (
          days.map((group) => (
            <div key={group.day}>
              <div className="sticky top-0 z-10 border-b border-dashed border-line bg-page/90 py-2 backdrop-blur">
                <span className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {group.day}
                </span>
              </div>
              <div className="divide-y divide-line">
                {group.events.map((event) => (
                  <article className="flex items-center gap-4 py-2.5" key={event.id}>
                    <time
                      className="w-16 shrink-0 font-mono text-2xs tabular-nums text-ink-3"
                      dateTime={event.createdAt}
                      title={formatDateTime(event.createdAt)}
                    >
                      {relativeTime(event.createdAt)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{event.action}</p>
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
