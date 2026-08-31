import Link from "next/link";
import { ArticleMarkdown } from "../../../components/article-markdown";
import { ButtonLink } from "../../../components/ui/button-link";
import { Card } from "../../../components/ui/card";
import { Chip } from "../../../components/ui/chip";
import { PageHeader } from "../../../components/ui/page-header";
import { StatusPill } from "../../../components/ui/status-pill";
import { api } from "../../../lib/api";
import { formatDateTime, relativeTime } from "../../../lib/format";
import { type ArticleCompaction, ArticleCompactionStatus } from "./article-compaction-status";

interface Article {
  id: string;
  brainId: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  currentVersion: number;
  freshness: string;
  keywords: string[];
  aliases: string[];
  links: ArticleRelation[];
  backlinks: ArticleRelation[];
  unresolvedLinks: Array<{ targetSlug: string; relation: "wiki" }>;
  relationsIndexed: boolean;
  compaction: ArticleCompaction;
  provenance: { changeSummary: string; createdAt: string; clientId: string | null };
}

interface ArticleRelation {
  articleId: string;
  slug: string;
  title: string;
  targetSlug: string;
  relation: string;
  origin: "wiki" | "manual";
}

interface Version {
  id: string;
  version: number;
  bodyHash: string;
  changeSummary: string;
  actorId: string;
  clientId: string | null;
  createdAt: string;
}

export default async function ArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  const [article, history] = await Promise.all([
    api<Article>(`/api/v1/articles/${articleId}`),
    api<Version[]>(`/api/v1/articles/${articleId}/history`),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        back={{ href: `/brains/${article.brainId}`, label: "Routing index" }}
        kicker={
          <>
            <Chip className="normal-case tracking-normal">v{article.currentVersion}</Chip>
            <StatusPill status={article.freshness} />
            <ArticleCompactionStatus articleId={articleId} initial={article.compaction} />
          </>
        }
        title={article.title}
        description={article.summary}
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink href={`/brains/${article.brainId}/graph`} variant="ghost">
              Open graph
            </ButtonLink>
            <ButtonLink href={`/articles/${articleId}/edit`} variant="ghost">
              Stage an edit
            </ButtonLink>
          </div>
        }
      />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="min-w-0 p-6 sm:p-8">
          <article className="markdown">
            <ArticleMarkdown body={article.body} links={article.links} />
          </article>
        </Card>
        <aside className="self-start lg:sticky lg:top-8">
          <Card className="divide-y divide-dashed divide-line">
            <section className="p-4">
              <AsideLabel>Provenance</AsideLabel>
              <p className="mt-2 break-words text-xs font-medium text-ink [overflow-wrap:anywhere]">
                {article.provenance.changeSummary}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs tabular-nums text-ink-3">
                <time
                  dateTime={article.provenance.createdAt}
                  title={formatDateTime(article.provenance.createdAt)}
                >
                  {relativeTime(article.provenance.createdAt)}
                </time>
                <span aria-hidden="true">·</span>
                <span className="break-words [overflow-wrap:anywhere]">
                  {article.provenance.clientId ?? "web"}
                </span>
              </p>
            </section>
            {article.keywords.length ? (
              <section className="p-4">
                <AsideLabel>Keywords</AsideLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {article.keywords.map((keyword) => (
                    <Chip key={keyword}>{keyword}</Chip>
                  ))}
                </div>
              </section>
            ) : null}
            {article.aliases.length ? (
              <section className="p-4">
                <AsideLabel>Aliases</AsideLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {article.aliases.map((alias) => (
                    <Chip key={alias}>{alias}</Chip>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="p-4">
              <div className="flex items-center justify-between gap-2">
                <AsideLabel>Relations</AsideLabel>
                <span className="font-mono text-2xs tabular-nums text-ink-3">
                  {article.links.length + article.backlinks.length}
                </span>
              </div>
              {!article.relationsIndexed ? (
                <p className="mt-2 rounded-control border border-orange/30 bg-orange-tint px-2.5 py-2 text-xs text-orange">
                  Body links are queued for indexing.
                </p>
              ) : null}
              <RelationList label="Outgoing" relations={article.links} />
              <RelationList label="Backlinks" relations={article.backlinks} />
              {article.unresolvedLinks.length ? (
                <div className="mt-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    Unresolved
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {article.unresolvedLinks.map((link) => (
                      <li
                        className="flex items-center gap-2 rounded-control border border-dashed border-orange/30 bg-orange-tint px-2.5 py-2"
                        key={link.targetSlug}
                      >
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-orange" />
                        <span className="min-w-0 truncate font-mono text-2xs text-orange">
                          {link.targetSlug}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!article.links.length &&
              !article.backlinks.length &&
              !article.unresolvedLinks.length ? (
                <p className="mt-2 text-xs text-ink-3">No article relations yet.</p>
              ) : null}
            </section>
            <section className="p-4">
              <AsideLabel>Versions</AsideLabel>
              <ol className="ml-1 mt-3 border-l border-dashed border-line">
                {history.map((version) => {
                  const current = version.version === article.currentVersion;
                  return (
                    <li key={version.id} className="relative pb-4 pl-4 last:pb-0">
                      <span
                        aria-hidden="true"
                        className={`absolute -left-[3px] top-1.5 size-[5px] rounded-full ${
                          current ? "bg-accent" : "bg-ink-3"
                        }`}
                      />
                      <div className="flex items-center gap-2">
                        <Chip
                          className="tabular-nums"
                          tone={current ? "accent" : "neutral"}
                        >{`v${version.version}`}</Chip>
                        <time
                          className="font-mono text-2xs tabular-nums text-ink-3"
                          dateTime={version.createdAt}
                          title={formatDateTime(version.createdAt)}
                        >
                          {relativeTime(version.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 break-words text-xs text-ink-2 [overflow-wrap:anywhere]">
                        {version.changeSummary}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </section>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function RelationList({ label, relations }: { label: string; relations: ArticleRelation[] }) {
  if (!relations.length) return null;
  return (
    <div className="mt-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </p>
      <ul className="mt-2 space-y-1">
        {relations.map((relation) => (
          <li
            key={`${relation.origin}:${relation.articleId}:${relation.relation}:${relation.targetSlug}`}
          >
            <Link
              className="group block rounded-control px-2.5 py-2 transition-colors hover:bg-hover"
              href={`/articles/${relation.articleId}`}
            >
              <span className="block truncate text-xs font-medium text-ink group-hover:text-accent">
                {relation.title}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5">
                <Chip tone={relation.origin === "wiki" ? "accent" : "neutral"}>
                  {relation.origin}
                </Chip>
                <span className="min-w-0 truncate font-mono text-2xs text-ink-3">
                  {relation.origin === "manual" ? relation.relation : relation.targetSlug}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AsideLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
      {children}
    </h2>
  );
}
