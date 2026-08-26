import Link from "next/link";
import { api, workspaceContext } from "../lib/api";
import { relativeTime } from "../lib/format";
import { AgentConnect } from "./agent-connect";
import { EyebrowPill } from "./pui";
import { AURORA_SOFT, AuroraBackdrop } from "./ui/backdrop";
import { ButtonLink } from "./ui/button-link";
import { Card, CardHeader } from "./ui/card";
import { Chip } from "./ui/chip";
import { StatusPill } from "./ui/status-pill";

interface Brain {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  updatedAt: string;
}

interface BrainDetail {
  routingIndex: Array<{ id: string }>;
}

interface Write {
  id: string;
  operation: string;
  slug: string;
  title: string;
  status: string;
  changeSummary: string;
  createdAt: string;
}

interface Activity {
  id: string;
  action: string;
  resource: string;
  clientId: string | null;
  createdAt: string;
}

interface BrainOverview {
  brain: Brain;
  articleCount: number;
  writes: Write[];
  activity: Activity[];
}

const OVERVIEW_LIMIT = 12;

const ACCENT_ACTIONS = new Set(["write.promoted", "write.approved", "promote", "approve"]);

export async function Dashboard() {
  const { workspaces, activeTeam, activeWorkspace } = await workspaceContext();
  const allBrains = await api<Brain[]>("/api/v1/brains");
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const sharedBrains = allBrains.filter((brain) => !workspaceIds.has(brain.workspaceId));
  if (!activeWorkspace || !activeTeam) return <NoWorkspace sharedBrains={sharedBrains} />;
  const brains = allBrains.filter((brain) => brain.workspaceId === activeWorkspace.id);
  if (!brains.length)
    return (
      <EmptyWorkspace
        teamName={activeTeam.name}
        workspaceName={activeWorkspace.name}
        mcpUrl={activeWorkspace.mcpUrl}
        sharedBrains={sharedBrains}
      />
    );

  const recentFirst = [...brains].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const overviews = await Promise.all(
    recentFirst.slice(0, OVERVIEW_LIMIT).map(async (brain): Promise<BrainOverview> => {
      const [detail, writes, activity] = await Promise.all([
        api<BrainDetail>(`/api/v1/brains/${brain.id}`),
        api<Write[]>(`/api/v1/brains/${brain.id}/writes`),
        api<Activity[]>(`/api/v1/brains/${brain.id}/activity?limit=12`),
      ]);
      return { brain, articleCount: detail.routingIndex.length, writes, activity };
    }),
  );

  const brainName = new Map(brains.map((brain) => [brain.id, brain.name]));
  const reviewQueue = overviews
    .flatMap(({ brain, writes }) =>
      writes
        .filter((write) => write.status === "pending" || write.status === "conflicted")
        .map((write) => ({ ...write, brainId: brain.id, brainName: brain.name })),
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "conflicted" ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const feed = overviews
    .flatMap(({ brain, activity }) => activity.map((event) => ({ ...event, brainId: brain.id })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);
  const articleTotal = overviews.reduce((sum, item) => sum + item.articleCount, 0);
  const pendingByBrain = new Map(
    overviews.map(({ brain, writes }) => [
      brain.id,
      writes.filter((write) => write.status === "pending" || write.status === "conflicted").length,
    ]),
  );

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] overflow-hidden opacity-70 [mask-image:linear-gradient(black,transparent)]">
        <AuroraBackdrop blobs={AURORA_SOFT} blur={110} />
      </div>
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <EyebrowPill statusColor="var(--grad-mid)">
              {activeTeam.name} · {activeWorkspace.name}
            </EyebrowPill>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Overview</h1>
            <p className="mt-1.5 max-w-xl text-sm text-ink-2">
              Recent changes across your brains and the writes that need your review.
            </p>
          </div>
          <dl className="flex items-stretch divide-x divide-dashed divide-line">
            <StatTile label="Brains" value={brains.length} />
            <StatTile label="Articles" value={articleTotal} />
            <StatTile label="Awaiting review" value={reviewQueue.length} attention />
          </dl>
        </header>

        <section className="mt-10" aria-labelledby="dash-review-title">
          <Card>
            <CardHeader
              title={<span id="dash-review-title">Needs review</span>}
              count={reviewQueue.length || undefined}
            />
            {reviewQueue.length ? (
              <div className="divide-y divide-line">
                {reviewQueue.slice(0, 6).map((write) => (
                  <Link
                    className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover ${
                      write.status === "conflicted"
                        ? "border-l-2 border-l-red bg-red/[0.04]"
                        : "border-l-2 border-l-transparent"
                    }`}
                    href={`/writes/${write.id}`}
                    key={write.id}
                  >
                    <StatusPill status={write.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{write.title}</p>
                      <p className="truncate text-xs text-ink-2">
                        {write.changeSummary || write.operation}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Chip>{write.brainName}</Chip>
                      <time
                        className="font-mono text-2xs tabular-nums text-ink-3"
                        dateTime={write.createdAt}
                      >
                        {relativeTime(write.createdAt)}
                      </time>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-2">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-green" />
                No staged writes need review.
              </p>
            )}
          </Card>
        </section>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-labelledby="dash-brains-title">
            <SectionHead id="dash-brains-title" title="Brains" note="Most recently updated first" />
            <div className="grid gap-4 sm:grid-cols-2">
              {recentFirst.map((brain) => {
                const pending = pendingByBrain.get(brain.id) ?? 0;
                const overview = overviews.find((item) => item.brain.id === brain.id);
                return (
                  <BrainCard
                    key={brain.id}
                    brain={brain}
                    badge={
                      pending ? (
                        <Chip tone="orange">
                          <span
                            aria-hidden="true"
                            className="size-1.5 animate-pulse-dot rounded-full bg-current"
                          />
                          {pending} to review
                        </Chip>
                      ) : null
                    }
                    meta={
                      overview
                        ? `${overview.articleCount} ${overview.articleCount === 1 ? "article" : "articles"}`
                        : null
                    }
                  />
                );
              })}
            </div>
          </section>

          <aside aria-labelledby="dash-activity-title">
            <SectionHead id="dash-activity-title" title="Recent activity" />
            {feed.length ? (
              <ol className="border-l border-line">
                {feed.map((event) => (
                  <li key={event.id} className="relative pb-5 pl-5 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[3px] top-1.5 size-[5px] rounded-full ${
                        ACCENT_ACTIONS.has(event.action) ? "bg-accent" : "bg-ink-3"
                      }`}
                    />
                    <time
                      className="font-mono text-[10.5px] tabular-nums text-ink-3"
                      dateTime={event.createdAt}
                    >
                      {relativeTime(event.createdAt)}
                    </time>
                    <p className="mt-0.5 text-xs font-medium text-ink">{event.action}</p>
                    <p className="truncate font-mono text-2xs text-ink-3">{event.resource}</p>
                    <p className="text-[10.5px] text-ink-3">
                      {brainName.get(event.brainId) ?? "Unknown brain"} · {event.clientId ?? "web"}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-2">
                No activity yet. Connected agents will appear here.
              </p>
            )}
          </aside>
        </div>

        <div className="mt-10">
          <AgentConnect workspaceName={activeWorkspace.name} mcpUrl={activeWorkspace.mcpUrl} />
        </div>

        <SharedBrains brains={sharedBrains} />
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  const hot = attention && value > 0;
  return (
    <div className="flex flex-col gap-1 px-6 first:pl-0 last:pr-0">
      <dt className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
        {hot ? (
          <span aria-hidden="true" className="size-1.5 animate-pulse-dot rounded-full bg-orange" />
        ) : null}
        {label}
      </dt>
      <dd
        className={`font-mono text-[28px] font-semibold tabular-nums leading-none ${
          hot
            ? "text-orange"
            : attention
              ? "text-ink-3"
              : "bg-gradient-to-r from-grad-from via-grad-mid to-grad-to bg-clip-text text-transparent"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SectionHead({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3 border-b border-dashed border-line pb-2">
      <h2
        id={id}
        className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        {title}
      </h2>
      {note ? <span className="text-2xs text-ink-3">{note}</span> : null}
    </div>
  );
}

function BrainCard({
  brain,
  badge,
  meta,
}: {
  brain: Brain;
  badge?: React.ReactNode;
  meta?: string | null;
}) {
  return (
    <Link
      className="group relative flex flex-col rounded-card border border-line bg-surface/70 p-4 shadow-card backdrop-blur-sm transition-all duration-150 hover:border-accent/30 hover:shadow-raised active:scale-[0.98]"
      href={`/brains/${brain.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Chip className="max-w-[60%]">
          <span className="truncate">{brain.slug}</span>
        </Chip>
        {badge}
      </div>
      <h3 className="mt-3 text-base font-semibold tracking-tight text-ink">{brain.name}</h3>
      <p className="mb-4 mt-1 line-clamp-2 text-xs text-ink-2">
        {brain.description || "No description yet."}
      </p>
      <div className="mt-auto flex items-center justify-between border-t border-line pt-2.5 font-mono text-2xs tabular-nums text-ink-3">
        <span>{meta}</span>
        <time dateTime={brain.updatedAt}>Updated {relativeTime(brain.updatedAt)}</time>
      </div>
    </Link>
  );
}

function SharedBrains({ brains }: { brains: Brain[] }) {
  if (!brains.length) return null;
  return (
    <section className="mt-10" aria-labelledby="dash-shared-title">
      <SectionHead
        id="dash-shared-title"
        title="Shared with me"
        note="Guest access outside your teams"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brains.map((brain) => (
          <BrainCard key={brain.id} brain={brain} badge={<Chip tone="accent">Guest</Chip>} />
        ))}
      </div>
    </section>
  );
}

function EmptyShell({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden opacity-80 [mask-image:linear-gradient(black,transparent)]">
        <AuroraBackdrop blobs={AURORA_SOFT} blur={110} />
      </div>
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
        <header>
          <EyebrowPill icon={false}>{kicker}</EyebrowPill>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Overview</h1>
        </header>
        {children}
      </main>
    </div>
  );
}

function NoWorkspace({ sharedBrains }: { sharedBrains: Brain[] }) {
  return (
    <EmptyShell kicker="Workspace">
      <section className="mt-12 rounded-card border border-dashed border-line bg-surface/50 px-6 py-14 text-center backdrop-blur-sm">
        <h2 className="bg-gradient-to-r from-grad-from via-grad-mid to-grad-to bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
          No workspace yet.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
          Create a team and workspace to collect brains and invite members.
        </p>
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/teams" variant="solid" sparkle>
            Set up your team
          </ButtonLink>
        </div>
      </section>
      <SharedBrains brains={sharedBrains} />
    </EmptyShell>
  );
}

function EmptyWorkspace({
  teamName,
  workspaceName,
  mcpUrl,
  sharedBrains,
}: {
  teamName: string;
  workspaceName: string;
  mcpUrl: string;
  sharedBrains: Brain[];
}) {
  return (
    <EmptyShell kicker={`${teamName} · ${workspaceName}`}>
      <div className="mt-8">
        <AgentConnect workspaceName={workspaceName} mcpUrl={mcpUrl} />
      </div>
      <section className="mt-8 rounded-card border border-dashed border-line bg-surface/50 px-6 py-14 text-center backdrop-blur-sm">
        <h2 className="bg-gradient-to-r from-grad-from via-grad-mid to-grad-to bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
          No brains yet.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
          Connect an agent over MCP to create your first brain. It will appear here with its
          articles, staged writes, and activity.
        </p>
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/connections" variant="ghost">
            View connections
          </ButtonLink>
        </div>
      </section>
      <SharedBrains brains={sharedBrains} />
    </EmptyShell>
  );
}
