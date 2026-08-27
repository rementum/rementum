import { cookies } from "next/headers";
import Link from "next/link";
import { api, workspaceContext } from "../lib/api";
import { relativeTime } from "../lib/format";
import {
  BRAINS_SORT_COOKIE,
  BRAINS_SORTS,
  BRAINS_VIEW_COOKIE,
  BRAINS_VIEWS,
  type BrainsSort,
  type BrainsView,
  parsePref,
} from "../lib/prefs";
import { AgentConnect } from "./agent-connect";
import { PrefToggle } from "./pref-toggle";
import { EyebrowPill } from "./pui";
import { AURORA_SOFT, AuroraBackdrop } from "./ui/backdrop";
import { ButtonLink } from "./ui/button-link";
import { Card, CardHeader } from "./ui/card";
import { Chip } from "./ui/chip";
import { IconGrid, IconIndex } from "./ui/icons";
import { Pager } from "./ui/pager";
import { StatusPill } from "./ui/status-pill";

interface Brain {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  updatedAt: string;
}

interface BrainArticleCount {
  brainId: string;
  articleCount: number;
  latestArticleUpdatedAt: string;
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

interface BrainPage {
  items: Brain[];
  total: number;
  page: number;
}

const PAGE_SIZE = 12;

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

async function fetchBrainPage(query: string, page: number): Promise<BrainPage> {
  const fetchAt = (target: number) =>
    api<{ items: Brain[]; total: number }>(
      `/api/v1/brains?${query}&limit=${PAGE_SIZE}&offset=${(target - 1) * PAGE_SIZE}`,
    );
  const data = await fetchAt(page);
  // A stale URL can point past the end; land on the last page instead of an empty grid.
  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  if (!data.items.length && data.total > 0 && page > lastPage) {
    return { ...(await fetchAt(lastPage)), page: lastPage };
  }
  return { ...data, page };
}

function dashboardHref(page: number, sharedPage: number) {
  const search = new URLSearchParams();
  if (page > 1) search.set("page", String(page));
  if (sharedPage > 1) search.set("sharedPage", String(sharedPage));
  const query = search.toString();
  return query ? `/?${query}` : "/";
}

const needsReview = (write: Write) => write.status === "pending" || write.status === "conflicted";

export async function Dashboard({ page, sharedPage }: { page?: string; sharedPage?: string }) {
  const cookieStore = await cookies();
  const view = parsePref(cookieStore.get(BRAINS_VIEW_COOKIE)?.value, BRAINS_VIEWS, "card");
  const sort = parsePref(cookieStore.get(BRAINS_SORT_COOKIE)?.value, BRAINS_SORTS, "updated");
  const { activeTeam, activeWorkspace } = await workspaceContext();
  // The unfiltered stats cover shared brains too, whose cards also show a truthful
  // "last updated"; the workspace-filtered fetch below feeds the Articles stat tile.
  const [shared, articleCounts] = await Promise.all([
    fetchBrainPage(`shared=true&sort=${sort}`, parsePage(sharedPage)),
    api<BrainArticleCount[]>("/api/v1/brains/article-counts"),
  ]);
  const statsByBrain = new Map(articleCounts.map((row) => [row.brainId, row]));
  const countByBrain = new Map(articleCounts.map((row) => [row.brainId, row.articleCount]));
  // brains.updated_at is frozen at creation; the newest article promote is the
  // truthful "last updated", falling back to creation time for empty brains.
  const lastUpdated = (brain: Brain) =>
    statsByBrain.get(brain.id)?.latestArticleUpdatedAt ?? brain.updatedAt;
  if (!activeWorkspace || !activeTeam)
    return <NoWorkspace shared={shared} view={view} lastUpdated={lastUpdated} />;
  const [brainPage, workspaceCounts] = await Promise.all([
    fetchBrainPage(`workspaceId=${activeWorkspace.id}&sort=${sort}`, parsePage(page)),
    api<BrainArticleCount[]>(`/api/v1/brains/article-counts?workspaceId=${activeWorkspace.id}`),
  ]);
  if (!brainPage.total)
    return (
      <EmptyWorkspace
        teamName={activeTeam.name}
        workspaceName={activeWorkspace.name}
        mcpUrl={activeWorkspace.mcpUrl}
        shared={shared}
        view={view}
        lastUpdated={lastUpdated}
      />
    );

  const brains = brainPage.items;
  // The review queue keeps recency semantics no matter which display sort or page is
  // active, so it reads the most recently updated brains — the current page when that
  // already is the recent-first page, one extra fetch otherwise.
  const recentFirst =
    sort === "updated" && brainPage.page === 1
      ? brains
      : (
          await api<{ items: Brain[]; total: number }>(
            `/api/v1/brains?workspaceId=${activeWorkspace.id}&sort=updated&limit=${PAGE_SIZE}&offset=0`,
          )
        ).items;
  const fanout = new Map<string, Brain>();
  for (const brain of [...recentFirst, ...brains]) fanout.set(brain.id, brain);
  const writesByBrain = new Map(
    await Promise.all(
      [...fanout.values()].map(async (brain) => {
        const writes = await api<Write[]>(`/api/v1/brains/${brain.id}/writes`);
        return [brain.id, writes] as const;
      }),
    ),
  );

  const reviewQueue = recentFirst
    .flatMap((brain) =>
      (writesByBrain.get(brain.id) ?? [])
        .filter(needsReview)
        .map((write) => ({ ...write, brainId: brain.id, brainName: brain.name })),
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "conflicted" ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const articleTotal = workspaceCounts.reduce((sum, row) => sum + row.articleCount, 0);
  const pendingByBrain = new Map(
    brains.map((brain) => [
      brain.id,
      (writesByBrain.get(brain.id) ?? []).filter(needsReview).length,
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
            <StatTile label="Brains" value={brainPage.total} />
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

        <section className="mt-10" aria-labelledby="dash-brains-title">
          <SectionHead
            id="dash-brains-title"
            title="Brains"
            note={SORT_NOTES[sort]}
            actions={
              <>
                <PrefToggle
                  cookieName={BRAINS_SORT_COOKIE}
                  value={sort}
                  label="Sort brains"
                  options={[
                    { value: "updated", label: "Updated" },
                    { value: "articles", label: "Articles" },
                    { value: "name", label: "Name" },
                  ]}
                />
                <PrefToggle
                  cookieName={BRAINS_VIEW_COOKIE}
                  value={view}
                  label="Brains layout"
                  options={[
                    { value: "card", label: "Card view", icon: <IconGrid /> },
                    { value: "list", label: "List view", icon: <IconIndex /> },
                  ]}
                />
              </>
            }
          />
          <BrainCollection
            view={view}
            items={brains.map((brain) => {
              const pending = pendingByBrain.get(brain.id) ?? 0;
              const count = countByBrain.get(brain.id) ?? 0;
              return {
                brain,
                updatedAt: lastUpdated(brain),
                meta: `${count} ${count === 1 ? "article" : "articles"}`,
                badge: pending ? (
                  <Chip tone="orange">
                    <span
                      aria-hidden="true"
                      className="size-1.5 animate-pulse-dot rounded-full bg-current"
                    />
                    {pending} to review
                  </Chip>
                ) : null,
              };
            })}
          />
          <Pager
            className="mt-4"
            page={brainPage.page}
            pageCount={Math.ceil(brainPage.total / PAGE_SIZE)}
            makeHref={(target) => dashboardHref(target, shared.page)}
          />
        </section>

        <div className="mt-10">
          <AgentConnect workspaceName={activeWorkspace.name} mcpUrl={activeWorkspace.mcpUrl} />
        </div>

        <SharedBrains
          shared={shared}
          view={view}
          lastUpdated={lastUpdated}
          mainPage={brainPage.page}
        />
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

const SORT_NOTES: Record<BrainsSort, string> = {
  updated: "Most recently updated first",
  articles: "Most articles first",
  name: "A to Z",
};

function SectionHead({
  id,
  title,
  note,
  actions,
}: {
  id: string;
  title: string;
  note?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-dashed border-line pb-2">
      <h2
        id={id}
        className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        {title}
      </h2>
      {note ? <span className="text-2xs text-ink-3">{note}</span> : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface BrainItem {
  brain: Brain;
  updatedAt: string;
  badge?: React.ReactNode;
  meta?: string | null;
}

function BrainCollection({ view, items }: { view: BrainsView; items: BrainItem[] }) {
  if (view === "list") {
    return (
      <Card>
        <div className="divide-y divide-line">
          {items.map((item) => (
            <BrainListRow key={item.brain.id} {...item} />
          ))}
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <BrainCard key={item.brain.id} {...item} />
      ))}
    </div>
  );
}

function BrainCard({ brain, updatedAt, badge, meta }: BrainItem) {
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
        <time dateTime={updatedAt}>Updated {relativeTime(updatedAt)}</time>
      </div>
    </Link>
  );
}

function BrainListRow({ brain, updatedAt, badge, meta }: BrainItem) {
  return (
    <Link
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover active:scale-[0.98]"
      href={`/brains/${brain.id}`}
    >
      <Chip className="max-w-[20%] shrink-0">
        <span className="truncate">{brain.slug}</span>
      </Chip>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-ink">{brain.name}</h3>
        <p className="line-clamp-1 text-xs text-ink-2">
          {brain.description || "No description yet."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {badge}
        {meta ? <span className="font-mono text-2xs tabular-nums text-ink-3">{meta}</span> : null}
        <time className="font-mono text-2xs tabular-nums text-ink-3" dateTime={updatedAt}>
          {relativeTime(updatedAt)}
        </time>
      </div>
    </Link>
  );
}

function SharedBrains({
  shared,
  view,
  lastUpdated,
  mainPage = 1,
}: {
  shared: BrainPage;
  view: BrainsView;
  lastUpdated: (brain: Brain) => string;
  mainPage?: number;
}) {
  if (!shared.total) return null;
  return (
    <section className="mt-10" aria-labelledby="dash-shared-title">
      <SectionHead
        id="dash-shared-title"
        title="Shared with me"
        note="Guest access outside your teams"
      />
      <BrainCollection
        view={view}
        items={shared.items.map((brain) => ({
          brain,
          updatedAt: lastUpdated(brain),
          badge: <Chip tone="accent">Guest</Chip>,
        }))}
      />
      <Pager
        className="mt-4"
        page={shared.page}
        pageCount={Math.ceil(shared.total / PAGE_SIZE)}
        makeHref={(target) => dashboardHref(mainPage, target)}
      />
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

function NoWorkspace({
  shared,
  view,
  lastUpdated,
}: {
  shared: BrainPage;
  view: BrainsView;
  lastUpdated: (brain: Brain) => string;
}) {
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
      <SharedBrains shared={shared} view={view} lastUpdated={lastUpdated} />
    </EmptyShell>
  );
}

function EmptyWorkspace({
  teamName,
  workspaceName,
  mcpUrl,
  shared,
  view,
  lastUpdated,
}: {
  teamName: string;
  workspaceName: string;
  mcpUrl: string;
  shared: BrainPage;
  view: BrainsView;
  lastUpdated: (brain: Brain) => string;
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
      <SharedBrains shared={shared} view={view} lastUpdated={lastUpdated} />
    </EmptyShell>
  );
}
