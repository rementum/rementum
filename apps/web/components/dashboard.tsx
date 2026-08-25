import Link from "next/link";
import { api } from "../lib/api";

interface Brain {
  id: string;
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
  const brains = await api<Brain[]>("/api/v1/brains");
  if (!brains.length) return <EmptyWorkspace />;

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
          <p className="kicker">Workspace</p>
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
                <span className={`status ${write.status}`}>{write.status}</span>
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
    </main>
  );
}

function EmptyWorkspace() {
  return (
    <main className="shell dash">
      <header className="page-intro dash-intro">
        <div>
          <p className="kicker">Workspace</p>
          <h1>Overview</h1>
        </div>
      </header>
      <section className="empty-state">
        <h2>No brains yet</h2>
        <p>
          Connect an agent over MCP or create a brain through the API. It will appear here with its
          articles, staged writes, and activity.
        </p>
        <div className="dash-empty-actions">
          <Link className="button secondary" href="/connections">
            View connections
          </Link>
          <a className="button secondary" href="/docs">
            Open API docs
          </a>
        </div>
      </section>
    </main>
  );
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.round(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
