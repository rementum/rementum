import Link from "next/link";
import { api, workspaceContext } from "../lib/api";
import { relativeTime } from "../lib/format";
import { AgentConnect } from "./agent-connect";
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
    <main className="shell dash">
      <header className="page-intro dash-intro">
        <div>
          <p className="kicker">
            {activeTeam.name} · {activeWorkspace.name}
          </p>
          <h1>Overview</h1>
          <p>What changed across your brains, and what waits for your review.</p>
        </div>
        <dl className="dash-stats">
          <div>
            <dt>Brains</dt>
            <dd>{brains.length}</dd>
          </div>
          <div>
            <dt>Articles</dt>
            <dd>{articleTotal}</dd>
          </div>
          <div className={reviewQueue.length ? "is-attention" : undefined}>
            <dt>Awaiting review</dt>
            <dd>{reviewQueue.length}</dd>
          </div>
        </dl>
      </header>

      <AgentConnect workspaceName={activeWorkspace.name} mcpUrl={activeWorkspace.mcpUrl} />

      <section className="dash-review" aria-labelledby="dash-review-title">
        <div className="dash-section-head">
          <h2 id="dash-review-title">Needs review</h2>
          {reviewQueue.length > 6 ? <span>{reviewQueue.length} staged writes</span> : null}
        </div>
        {reviewQueue.length ? (
          <div className="dash-review-list">
            {reviewQueue.slice(0, 6).map((write) => (
              <Link
                className={`dash-review-row${write.status === "conflicted" ? " is-conflicted" : ""}`}
                href={`/writes/${write.id}`}
                key={write.id}
              >
                <StatusPill status={write.status} />
                <div className="dash-review-body">
                  <strong>{write.title}</strong>
                  <p>{write.changeSummary || write.operation}</p>
                </div>
                <div className="dash-review-meta">
                  <span>{write.brainName}</span>
                  <time dateTime={write.createdAt}>{relativeTime(write.createdAt)}</time>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="dash-settled">Canon is settled. No staged writes wait for review.</p>
        )}
      </section>

      <div className="dash-columns">
        <section aria-labelledby="dash-brains-title">
          <div className="dash-section-head">
            <h2 id="dash-brains-title">Brains</h2>
            <span>Most recently updated first</span>
          </div>
          <div className="dash-brain-grid">
            {recentFirst.map((brain) => {
              const pending = pendingByBrain.get(brain.id) ?? 0;
              const overview = overviews.find((item) => item.brain.id === brain.id);
              return (
                <Link className="dash-brain-card" href={`/brains/${brain.id}`} key={brain.id}>
                  <div className="dash-brain-top">
                    <span className="mono">{brain.slug}</span>
                    {pending ? <span className="dash-badge">{pending} to review</span> : null}
                  </div>
                  <h3>{brain.name}</h3>
                  <p>{brain.description || "No description yet."}</p>
                  <div className="dash-brain-meta">
                    {overview ? (
                      <span>
                        {overview.articleCount}{" "}
                        {overview.articleCount === 1 ? "article" : "articles"}
                      </span>
                    ) : null}
                    <time dateTime={brain.updatedAt}>Updated {relativeTime(brain.updatedAt)}</time>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="dash-activity" aria-labelledby="dash-activity-title">
          <div className="dash-section-head">
            <h2 id="dash-activity-title">Recent activity</h2>
          </div>
          {feed.length ? (
            <ol className="dash-feed">
              {feed.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.createdAt}>{relativeTime(event.createdAt)}</time>
                  <div>
                    <strong>{event.action}</strong>
                    <span className="dash-feed-resource">{event.resource}</span>
                    <span className="dash-feed-source">
                      {brainName.get(event.brainId) ?? "Unknown brain"} · {event.clientId ?? "web"}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="dash-settled">No activity yet. Connected agents will appear here.</p>
          )}
        </aside>
      </div>
      <SharedBrains brains={sharedBrains} />
    </main>
  );
}

function SharedBrains({ brains }: { brains: Brain[] }) {
  if (!brains.length) return null;
  return (
    <section aria-labelledby="dash-shared-title">
      <div className="dash-section-head">
        <h2 id="dash-shared-title">Shared with me</h2>
        <span>Guest access outside your teams</span>
      </div>
      <div className="dash-brain-grid">
        {brains.map((brain) => (
          <Link className="dash-brain-card" href={`/brains/${brain.id}`} key={brain.id}>
            <div className="dash-brain-top">
              <span className="mono">{brain.slug}</span>
              <span className="role-badge">Guest</span>
            </div>
            <h3>{brain.name}</h3>
            <p>{brain.description || "No description yet."}</p>
            <div className="dash-brain-meta">
              <time dateTime={brain.updatedAt}>Updated {relativeTime(brain.updatedAt)}</time>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function NoWorkspace({ sharedBrains }: { sharedBrains: Brain[] }) {
  return (
    <main className="shell dash">
      <header className="page-intro dash-intro">
        <div>
          <p className="kicker">Workspace</p>
          <h1>Overview</h1>
        </div>
      </header>
      <section className="empty-state">
        <h2>No workspace yet</h2>
        <p>Create a team and workspace to collect brains and invite members.</p>
        <div className="dash-empty-actions">
          <Link className="button" href="/teams">
            Set up your team
          </Link>
        </div>
      </section>
      <SharedBrains brains={sharedBrains} />
    </main>
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
    <main className="shell dash">
      <header className="page-intro dash-intro">
        <div>
          <p className="kicker">
            {teamName} · {workspaceName}
          </p>
          <h1>Overview</h1>
        </div>
      </header>
      <AgentConnect workspaceName={workspaceName} mcpUrl={mcpUrl} />
      <section className="empty-state">
        <h2>No brains yet</h2>
        <p>
          Connect an agent over MCP to create your first brain. It will appear here with its
          articles, staged writes, and activity.
        </p>
        <div className="dash-empty-actions">
          <Link className="button secondary" href="/connections">
            View connections
          </Link>
        </div>
      </section>
      <SharedBrains brains={sharedBrains} />
    </main>
  );
}
