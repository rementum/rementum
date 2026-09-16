import { cookies } from "next/headers";
import Link from "next/link";
import { api, workspaceContext } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import { template } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
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
import { ButtonLink } from "./ui/button-link";
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

interface ReviewQueue {
  items: Array<{
    id: string;
    brainId: string;
    brainName: string;
    operation: string;
    slug: string;
    title: string;
    status: string;
    changeSummary: string;
    createdAt: string;
  }>;
  counts: Array<{ brainId: string; pending: number; conflicted: number }>;
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
  return query ? `/dashboard?${query}` : "/dashboard";
}

export async function Dashboard({
  page,
  sharedPage,
  locale,
  dict,
}: {
  page?: string;
  sharedPage?: string;
  locale: Locale;
  dict: Dictionary;
}) {
  const cookieStore = await cookies();
  const view = parsePref(cookieStore.get(BRAINS_VIEW_COOKIE)?.value, BRAINS_VIEWS, "list");
  const sort = parsePref(cookieStore.get(BRAINS_SORT_COOKIE)?.value, BRAINS_SORTS, "updated");
  const { activeTeam, activeWorkspace } = await workspaceContext();
  const dash = dict.dashboard;
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
    return (
      <NoWorkspace
        shared={shared}
        view={view}
        lastUpdated={lastUpdated}
        locale={locale}
        dict={dict}
      />
    );
  // One request answers both the review queue and the per-brain badge counts; it used to
  // take a request per brain on the page plus one per recently updated brain.
  const [brainPage, workspaceCounts, reviewQueueData] = await Promise.all([
    fetchBrainPage(`workspaceId=${activeWorkspace.id}&sort=${sort}`, parsePage(page)),
    api<BrainArticleCount[]>(`/api/v1/brains/article-counts?workspaceId=${activeWorkspace.id}`),
    api<ReviewQueue>(`/api/v1/workspaces/${activeWorkspace.id}/review-queue`),
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
        locale={locale}
        dict={dict}
      />
    );

  const brains = brainPage.items;
  // The API already orders conflicts first, then newest first, across the whole workspace.
  const reviewQueue = reviewQueueData.items;
  const articleTotal = workspaceCounts.reduce((sum, row) => sum + row.articleCount, 0);
  const pendingByBrain = new Map(
    reviewQueueData.counts.map((row) => [row.brainId, row.pending + row.conflicted]),
  );

  const reviewTotal = reviewQueueData.counts.reduce(
    (sum, row) => sum + row.pending + row.conflicted,
    0,
  );
  const conflicts = reviewQueueData.counts.reduce((sum, row) => sum + row.conflicted, 0);
  const brainNames = new Map([
    ...brains.map((brain) => [brain.id, brain.name] as const),
    ...reviewQueue.map((write) => [write.brainId, write.brainName] as const),
  ]);
  const articleLabel = (count: number) =>
    count === 1 ? dash.articleOne : template(dash.articleMany, { count });

  return (
    <main className="mx-auto w-full max-w-[1360px] px-5 pt-8 pb-16 sm:px-8 lg:pt-10">
      <header className="pb-7">
        <p className="text-ink-3 text-xs">
          {activeTeam.name}{" "}
          <span aria-hidden="true" className="px-2">
            /
          </span>{" "}
          {activeWorkspace.name}
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-medium text-[30px] text-ink leading-tight tracking-tight">
              {dash.brains}
            </h1>
            <p className="mt-2 text-ink-2 text-sm">{dash.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-ink-2 text-xs tabular-nums">
            <p>{template(dash.brainsCount, { count: brainPage.total })}</p>
            <p>{template(dash.articlesCount, { count: articleTotal })}</p>
            <a
              href="#dash-review"
              className={`action-link min-h-9 px-3 py-2 text-xs ${conflicts ? "border-red/20 bg-red-tint text-red" : reviewTotal ? "border-orange/20 bg-orange-tint text-orange" : "border-line text-ink-2"}`}
            >
              {reviewTotal
                ? template(dash.reviewSummary, { total: reviewTotal, conflicts })
                : dash.noWrites}
            </a>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <section aria-labelledby="dash-brains-title" className="surface-panel pb-1">
            <div className="border-line border-b p-5 sm:px-6">
              <SectionHead
                id="dash-brains-title"
                title={dash.yourWorkspace}
                actions={
                  <>
                    <PrefToggle
                      cookieName={BRAINS_SORT_COOKIE}
                      value={sort}
                      label={dash.sortBrains}
                      options={[
                        { value: "updated", label: dash.sortUpdated },
                        { value: "articles", label: dash.sortArticles },
                        { value: "name", label: dash.sortName },
                      ]}
                    />
                    <PrefToggle
                      cookieName={BRAINS_VIEW_COOKIE}
                      value={view}
                      label={dash.brainsLayout}
                      options={[
                        { value: "list", label: dash.listView, icon: <IconIndex /> },
                        { value: "card", label: dash.cardView, icon: <IconGrid /> },
                      ]}
                    />
                  </>
                }
              />
              <p className="mt-3 text-ink-3 text-xs">{SORT_NOTES[sort](dash)}</p>
            </div>
            <BrainCollection
              view={view}
              locale={locale}
              dict={dict}
              items={brains.map((brain) => {
                const pending = pendingByBrain.get(brain.id) ?? 0;
                const count = countByBrain.get(brain.id) ?? 0;
                return {
                  brain,
                  updatedAt: lastUpdated(brain),
                  meta: articleLabel(count),
                  badge: pending ? (
                    <Chip tone="orange">{template(dash.toReview, { count: pending })}</Chip>
                  ) : null,
                };
              })}
            />
            <Pager
              className="mx-5 my-4"
              page={brainPage.page}
              pageCount={Math.ceil(brainPage.total / PAGE_SIZE)}
              makeHref={(target) => dashboardHref(target, shared.page)}
              dict={dict}
            />
          </section>
          <SharedBrains
            shared={shared}
            view={view}
            lastUpdated={lastUpdated}
            mainPage={brainPage.page}
            locale={locale}
            dict={dict}
          />
        </div>

        <aside
          id="dash-review"
          aria-labelledby="dash-review-title"
          className="surface-panel min-w-0 scroll-mt-24 p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="dash-review-title" className="font-medium text-base text-ink">
              {dash.needsReview}
            </h2>
            <span className="rounded-chip bg-inset px-2 py-0.5 font-mono text-ink-2 text-xs">
              {reviewTotal}
            </span>
          </div>
          <p className="mt-2 text-ink-3 text-xs leading-relaxed">{dash.reviewNote}</p>
          {reviewQueue.length ? (
            <>
              <ol className="mt-5 divide-y divide-line">
                {reviewQueue.slice(0, 6).map((write) => (
                  <ReviewItem key={write.id} write={write} locale={locale} dict={dict} />
                ))}
              </ol>
              {reviewQueue.length > 6 ? (
                <details className="mt-3">
                  <summary className="cursor-pointer rounded-control py-2 font-medium text-accent text-sm">
                    {template(dash.showMore, { count: reviewQueue.length - 6 })}
                  </summary>
                  <ol className="divide-y divide-line">
                    {reviewQueue.slice(6).map((write) => (
                      <ReviewItem key={write.id} write={write} locale={locale} dict={dict} />
                    ))}
                  </ol>
                </details>
              ) : null}
              {reviewTotal > reviewQueue.length ? (
                <div className="mt-5 border-line border-t pt-4">
                  <p className="text-ink-3 text-xs leading-relaxed">
                    {template(dash.showingOf, { shown: reviewQueue.length, total: reviewTotal })}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {reviewQueueData.counts
                      .filter((row) => row.pending + row.conflicted > 0)
                      .map((row) => (
                        <li key={row.brainId}>
                          <Link
                            href={`/brains/${row.brainId}/writes`}
                            className="break-words text-accent text-xs hover:underline"
                          >
                            {brainNames.get(row.brainId) ?? `Brain ${row.brainId.slice(0, 8)}`} ·{" "}
                            {row.pending + row.conflicted}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="field-note mt-6">{dash.emptyReview}</p>
          )}
        </aside>
      </div>

      <details className="surface-panel group mt-6 px-5 py-3 sm:px-6">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 rounded-control py-2 text-ink-2 text-sm [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="font-mono text-accent group-open:hidden">
            +
          </span>
          <span aria-hidden="true" className="hidden font-mono text-accent group-open:inline">
            −
          </span>
          <span className="font-medium text-ink">{dash.connectAgent}</span>
          <span className="text-ink-3 text-xs">
            {template(dash.connectNote, { workspace: activeWorkspace.name })}
          </span>
        </summary>
        <div className="mt-5">
          <AgentConnect
            workspaceName={activeWorkspace.name}
            mcpUrl={activeWorkspace.mcpUrl}
            dict={dict}
          />
        </div>
      </details>
    </main>
  );
}

function ReviewItem({
  write,
  locale,
  dict,
}: {
  write: ReviewQueue["items"][number];
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <li>
      <Link
        href={`/writes/${write.id}`}
        className="-mx-2 block rounded-control px-2 py-4 hover:bg-hover"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <StatusPill
            status={write.status}
            label={
              write.status === "conflicted"
                ? dict.dashboard.conflictedLabel
                : dict.dashboard.pendingLabel
            }
            pulse={false}
          />
          <time dateTime={write.createdAt} className="font-mono text-ink-3 text-xs">
            {relativeTime(write.createdAt, locale)}
          </time>
        </div>
        <h3 className="break-words font-medium text-ink text-sm leading-relaxed">{write.title}</h3>
        <p className="mt-1 line-clamp-2 break-words text-ink-2 text-xs leading-relaxed">
          {write.changeSummary || write.operation}
        </p>
        <p className="mt-2 break-words text-ink-3 text-xs">{write.brainName}</p>
      </Link>
    </li>
  );
}

const SORT_NOTES: Record<BrainsSort, (dash: Dictionary["dashboard"]) => string> = {
  updated: (dash) => dash.sortNoteUpdated,
  articles: (dash) => dash.sortNoteArticles,
  name: (dash) => dash.sortNoteName,
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
    <div className="flex flex-wrap items-center gap-3">
      <h2 id={id} className="font-medium text-base text-ink">
        {title}
      </h2>
      {note ? <span className="text-ink-3 text-xs">{note}</span> : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface BrainItem {
  brain: Brain;
  updatedAt: string;
  badge?: React.ReactNode;
  meta?: string | null;
}

function BrainCollection({
  view,
  items,
  locale,
  dict,
}: {
  view: BrainsView;
  items: BrainItem[];
  locale: Locale;
  dict: Dictionary;
}) {
  return view === "list" ? (
    <div className="divide-y divide-line">
      {items.map((item) => (
        <BrainListRow key={item.brain.id} locale={locale} dict={dict} {...item} />
      ))}
    </div>
  ) : (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {items.map((item) => (
        <BrainCard key={item.brain.id} locale={locale} dict={dict} {...item} />
      ))}
    </div>
  );
}

function BrainCard({
  brain,
  updatedAt,
  badge,
  meta,
  locale,
  dict,
}: BrainItem & { locale: Locale; dict: Dictionary }) {
  return (
    <Link
      className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 hover:border-accent"
      href={`/brains/${brain.id}`}
    >
      <h3 className="break-words font-medium text-base text-ink tracking-tight">{brain.name}</h3>
      <p className="mt-1 break-all font-mono text-ink-3 text-xs">{brain.slug}</p>
      <p className="mt-3 mb-5 line-clamp-3 text-ink-2 text-sm leading-relaxed">
        {brain.description || dict.dashboard.noDescription}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-line border-t pt-3 text-ink-3 text-xs">
        {meta ? <span>{meta}</span> : null}
        <time dateTime={updatedAt}>
          {template(dict.dashboard.updated, { time: relativeTime(updatedAt, locale) })}
        </time>
        {badge}
      </div>
    </Link>
  );
}

function BrainListRow({
  brain,
  updatedAt,
  badge,
  meta,
  locale,
  dict,
}: BrainItem & { locale: Locale; dict: Dictionary }) {
  return (
    <Link className="brain-row group" href={`/brains/${brain.id}`}>
      <div className="min-w-0">
        <h3 className="break-words font-medium text-base text-ink tracking-tight group-hover:text-accent">
          {brain.name}
        </h3>
        <p className="mt-1 line-clamp-2 break-words text-ink-2 text-sm leading-relaxed">
          {brain.description || dict.dashboard.noDescription}
        </p>
        <p className="mt-1.5 break-all font-mono text-ink-3 text-xs">{brain.slug}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-ink-3 text-xs sm:flex-col sm:items-end sm:gap-2 sm:pt-1">
        {meta ? <span className="text-ink-2 tabular-nums">{meta}</span> : null}
        <time dateTime={updatedAt} className="whitespace-nowrap">
          {template(dict.dashboard.updated, { time: relativeTime(updatedAt, locale) })}
        </time>
        {badge}
      </div>
    </Link>
  );
}

function SharedBrains({
  shared,
  view,
  lastUpdated,
  mainPage = 1,
  locale,
  dict,
}: {
  shared: BrainPage;
  view: BrainsView;
  lastUpdated: (brain: Brain) => string;
  mainPage?: number;
  locale: Locale;
  dict: Dictionary;
}) {
  if (!shared.total) return null;
  return (
    <section className="surface-panel mt-6 pb-1" aria-labelledby="dash-shared-title">
      <div className="border-line border-b p-5 sm:px-6">
        <SectionHead
          id="dash-shared-title"
          title={dict.dashboard.sharedWithMe}
          note={dict.dashboard.sharedNote}
        />
      </div>
      <BrainCollection
        view={view}
        locale={locale}
        dict={dict}
        items={shared.items.map((brain) => ({
          brain,
          updatedAt: lastUpdated(brain),
          badge: <Chip tone="accent">{dict.dashboard.guest}</Chip>,
        }))}
      />
      <Pager
        className="mx-5 my-4"
        page={shared.page}
        pageCount={Math.ceil(shared.total / PAGE_SIZE)}
        makeHref={(target) => dashboardHref(mainPage, target)}
        dict={dict}
      />
    </section>
  );
}

function EmptyShell({
  kicker,
  children,
  dict,
}: {
  kicker: string;
  children: React.ReactNode;
  dict: Dictionary;
}) {
  return (
    <main className="mx-auto w-full max-w-[1360px] px-5 pt-8 pb-16 sm:px-8 lg:pt-10">
      <header className="pb-7">
        <p className="text-ink-3 text-xs">{kicker}</p>
        <h1 className="mt-4 font-medium text-[30px] text-ink leading-tight tracking-tight">
          {dict.dashboard.brains}
        </h1>
      </header>
      {children}
    </main>
  );
}

function NoWorkspace({
  shared,
  view,
  lastUpdated,
  locale,
  dict,
}: {
  shared: BrainPage;
  view: BrainsView;
  lastUpdated: (brain: Brain) => string;
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <EmptyShell kicker={dict.dashboard.noWorkspaceKicker} dict={dict}>
      <section className="surface-panel my-4 max-w-xl p-7">
        <h2 className="font-medium text-ink text-xl tracking-tight">
          {dict.dashboard.noWorkspaceTitle}
        </h2>
        <p className="mt-3 text-ink-2 text-sm leading-relaxed">{dict.dashboard.noWorkspaceBody}</p>
        <div className="mt-5">
          <ButtonLink href="/teams">{dict.dashboard.setupTeam}</ButtonLink>
        </div>
      </section>
      <SharedBrains
        shared={shared}
        view={view}
        lastUpdated={lastUpdated}
        locale={locale}
        dict={dict}
      />
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
  locale,
  dict,
}: {
  teamName: string;
  workspaceName: string;
  mcpUrl: string;
  shared: BrainPage;
  view: BrainsView;
  lastUpdated: (brain: Brain) => string;
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <EmptyShell kicker={`${teamName} / ${workspaceName}`} dict={dict}>
      <section className="surface-panel my-4 max-w-xl p-7">
        <h2 className="font-medium text-ink text-xl tracking-tight">
          {dict.dashboard.noBrainsTitle}
        </h2>
        <p className="mt-3 text-ink-2 text-sm leading-relaxed">{dict.dashboard.noBrainsBody}</p>
        <div className="mt-4">
          <ButtonLink href="/connections" variant="ghost">
            {dict.dashboard.viewConnections}
          </ButtonLink>
        </div>
      </section>
      <AgentConnect workspaceName={workspaceName} mcpUrl={mcpUrl} dict={dict} />
      <SharedBrains
        shared={shared}
        view={view}
        lastUpdated={lastUpdated}
        locale={locale}
        dict={dict}
      />
    </EmptyShell>
  );
}
