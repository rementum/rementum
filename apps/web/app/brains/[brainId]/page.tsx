import { cookies } from "next/headers";
import Link from "next/link";
import { BrainDangerZone } from "../../../components/brain-danger-zone";
import { BrainNav } from "../../../components/brain-nav";
import { InviteMemberForm } from "../../../components/invite-member-form";
import { PrefToggle } from "../../../components/pref-toggle";
import { Card, CardHeader } from "../../../components/ui/card";
import { Pager } from "../../../components/ui/pager";
import { StatusPill } from "../../../components/ui/status-pill";
import { api } from "../../../lib/api";
import { relativeTime } from "../../../lib/format";
import { ARTICLES_SORT_COOKIE, ARTICLES_SORTS, parsePref } from "../../../lib/prefs";

interface BrainResponse {
  brain: { id: string; name: string; description: string; instructions: string };
  role: "owner" | "editor" | "commenter" | "viewer";
  articleTotal: number;
  routingIndex: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    freshness: string;
    currentVersion: number;
    updatedAt: string;
  }>;
}

const PAGE_SIZE = 50;

export default async function BrainPage({
  params,
  searchParams,
}: {
  params: Promise<{ brainId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { brainId } = await params;
  const { page: pageParam } = await searchParams;
  // parsePref narrows the cookie to the closed enum before it touches the URL,
  // and the API validates the value again.
  const sort = parsePref(
    (await cookies()).get(ARTICLES_SORT_COOKIE)?.value,
    ARTICLES_SORTS,
    "updated",
  );
  const requested = Number(pageParam);
  let page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const fetchAt = (target: number) =>
    api<BrainResponse>(
      `/api/v1/brains/${brainId}?sort=${sort}&limit=${PAGE_SIZE}&offset=${(target - 1) * PAGE_SIZE}`,
    );
  let data = await fetchAt(page);
  const pageCount = Math.max(1, Math.ceil(data.articleTotal / PAGE_SIZE));
  // A stale URL can point past the end; land on the last page instead of an empty list.
  if (!data.routingIndex.length && page > pageCount) {
    page = pageCount;
    data = await fetchAt(page);
  }
  const offset = (page - 1) * PAGE_SIZE;
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="self-start lg:sticky lg:top-8">
          <Link
            className="inline-flex items-center gap-1 font-mono text-2xs text-ink-3 transition-colors hover:text-ink"
            href="/dashboard"
          >
            ← All brains
          </Link>
          <div className="mt-5 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-control bg-gradient-to-br from-grad-from to-grad-to font-mono text-sm font-bold uppercase text-white"
            >
              {data.brain.name.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Brain</p>
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-ink">
                {data.brain.name}
              </h1>
            </div>
          </div>
          {data.brain.description ? (
            <p className="mt-3 text-sm text-ink-2">{data.brain.description}</p>
          ) : null}
          {data.brain.instructions ? (
            <div className="mt-4 rounded-control border border-dashed border-line bg-inset/50 p-3">
              <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Instructions
              </span>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-2">
                {data.brain.instructions}
              </p>
            </div>
          ) : null}
          <div className="mt-4">
            <a
              className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink active:scale-[0.98]"
              href={`/brains/${brainId}/export`}
            >
              Export Markdown
            </a>
          </div>
          <details className="group mt-4 rounded-control border border-line bg-surface shadow-hairline">
            <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
              Invite teammate
              <span
                aria-hidden="true"
                className="text-sm leading-none transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="border-t border-dashed border-line p-3">
              <InviteMemberForm brainId={brainId} />
            </div>
          </details>
          {data.role === "owner" ? (
            <BrainDangerZone brainId={brainId} name={data.brain.name} />
          ) : null}
        </aside>
        <section>
          <BrainNav brainId={brainId} />
          <div className="mt-6">
            <Card>
              <CardHeader
                title="Current canon"
                count={`${data.articleTotal} ${data.articleTotal === 1 ? "article" : "articles"}`}
                action={
                  <PrefToggle
                    cookieName={ARTICLES_SORT_COOKIE}
                    value={sort}
                    label="Sort articles"
                    options={[
                      { value: "updated", label: "Updated" },
                      { value: "title", label: "Title" },
                    ]}
                  />
                }
              />
              {data.routingIndex.length ? (
                <div className="divide-y divide-line">
                  {data.routingIndex.map((article, index) => (
                    <Link
                      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover active:scale-[0.98]"
                      href={`/articles/${article.id}`}
                      key={article.id}
                    >
                      <span className="shrink-0 font-mono text-2xs tabular-nums text-ink-3">
                        {String(offset + index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-medium text-ink">{article.title}</h2>
                        <p className="line-clamp-1 text-xs text-ink-2">{article.summary}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusPill status={article.freshness} />
                        <time
                          className="font-mono text-2xs tabular-nums text-ink-3"
                          dateTime={article.updatedAt}
                        >
                          {relativeTime(article.updatedAt)}
                        </time>
                        <span className="font-mono text-2xs tabular-nums text-ink-3">
                          v{article.currentVersion}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-6 text-sm text-ink-2">
                  The routing index is empty. Ask a connected agent to stage the first article.
                </p>
              )}
            </Card>
            <Pager
              className="mt-4"
              page={page}
              pageCount={pageCount}
              makeHref={(target) =>
                target > 1 ? `/brains/${brainId}?page=${target}` : `/brains/${brainId}`
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}
