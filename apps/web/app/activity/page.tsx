import type { Metadata } from "next";
import { Chip } from "../../components/ui/chip";
import { EmptyState } from "../../components/ui/empty-state";
import { PageHeader } from "../../components/ui/page-header";
import { api, workspaceContext } from "../../lib/api";
import { formatDate, formatDateTime, relativeTime } from "../../lib/format";

export const metadata: Metadata = { title: "MCP Activity" };

interface Brain {
  id: string;
  workspaceId: string;
  name: string;
}

interface Activity {
  id: string;
  action: string;
  resource: string;
  clientId: string;
  createdAt: string;
}

const BRAIN_LIMIT = 16;

export default async function WorkspaceActivityPage() {
  const { activeTeam, activeWorkspace } = await workspaceContext();
  if (!activeTeam || !activeWorkspace) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
        <PageHeader kicker="Workspace" title="MCP Activity" />
        <section className="mt-8">
          <EmptyState
            title="No workspace yet."
            body="Create a team and workspace to see MCP activity here."
          />
        </section>
      </main>
    );
  }
  const { items: brains } = await api<{ items: Brain[]; total: number }>(
    `/api/v1/brains?workspaceId=${activeWorkspace.id}&limit=${BRAIN_LIMIT}`,
  );
  const brainName = new Map(brains.map((brain) => [brain.id, brain.name]));
  const feeds = await Promise.all(
    brains.map(async (brain) => {
      const events = await api<Activity[]>(
        `/api/v1/brains/${brain.id}/activity?limit=50&source=mcp`,
      );
      return events.map((event) => ({ ...event, brainId: brain.id }));
    }),
  );
  const activity = feeds
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200);

  const days: Array<{ day: string; events: typeof activity }> = [];
  for (const event of activity) {
    const day = formatDate(event.createdAt);
    const group = days.at(-1);
    if (group && group.day === day) group.events.push(event);
    else days.push({ day, events: [event] });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        kicker={`${activeTeam.name} · ${activeWorkspace.name}`}
        title="MCP Activity"
        description="Everything connected MCP agents did across this workspace's brains."
      />
      <section className="mt-8">
        {days.length ? (
          days.map((group) => (
            <div key={group.day}>
              <div className="sticky top-14 z-10 border-b border-dashed border-line bg-page/90 py-2 backdrop-blur md:top-0">
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
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip>{brainName.get(event.brainId) ?? "Unknown brain"}</Chip>
                      <Chip>{event.clientId}</Chip>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No MCP activity yet." body="Connected agents will appear here." />
        )}
      </section>
    </main>
  );
}
