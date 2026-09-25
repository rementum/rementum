import { ArticleMarkdown } from "../../../components/article-markdown";
import { ButtonLink } from "../../../components/ui/button-link";
import { Card } from "../../../components/ui/card";
import { Chip } from "../../../components/ui/chip";
import { PageHeader } from "../../../components/ui/page-header";
import { StatusPill } from "../../../components/ui/status-pill";
import { api } from "../../../lib/api";
import { formatDateTime, relativeTime } from "../../../lib/format";
import { template } from "../../../lib/i18n/get-dictionary";
import { requestDictionary } from "../../../lib/i18n/server";

interface Article {
  id: string;
  brainId: string;
  title: string;
  summary: string;
  body: string;
  currentVersion: number;
  freshness: string;
  keywords: string[];
  provenance: { changeSummary: string; createdAt: string; clientId: string | null };
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
  const { locale, dict } = await requestDictionary();
  const strings = dict.articles;
  const statuses: Record<string, string> = {
    current: strings.freshnessCurrent,
    review_due: strings.freshnessReviewDue,
    stale: strings.freshnessStale,
    unknown: strings.freshnessUnknown,
  };

  const { articleId } = await params;
  const [article, history] = await Promise.all([
    api<Article>(`/api/v1/articles/${articleId}`),
    api<Version[]>(`/api/v1/articles/${articleId}/history`),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        back={{ href: `/brains/${article.brainId}`, label: strings.routingIndex }}
        kicker={
          <>
            <Chip className="normal-case tracking-normal">
              {template(strings.version, { version: article.currentVersion })}
            </Chip>
            <StatusPill
              status={article.freshness}
              label={statuses[article.freshness] ?? article.freshness}
            />
          </>
        }
        title={article.title}
        description={article.summary}
        actions={
          <ButtonLink href={`/articles/${articleId}/edit`} variant="ghost">
            {strings.stageAnEdit}
          </ButtonLink>
        }
      />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="min-w-0 p-6 sm:p-8">
          <article className="markdown">
            <ArticleMarkdown body={article.body} />
          </article>
        </Card>
        <aside className="self-start lg:sticky lg:top-8">
          <Card className="divide-y divide-dashed divide-line">
            <section className="p-4">
              <AsideLabel>{strings.provenance}</AsideLabel>
              <p className="mt-2 break-words text-xs font-medium text-ink [overflow-wrap:anywhere]">
                {article.provenance.changeSummary}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs tabular-nums text-ink-3">
                <time
                  dateTime={article.provenance.createdAt}
                  title={formatDateTime(article.provenance.createdAt, locale)}
                >
                  {relativeTime(article.provenance.createdAt, locale)}
                </time>
                <span aria-hidden="true">·</span>
                <span className="break-words [overflow-wrap:anywhere]">
                  {article.provenance.clientId ?? strings.web}
                </span>
              </p>
            </section>
            {article.keywords.length ? (
              <section className="p-4">
                <AsideLabel>{strings.keywords}</AsideLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {article.keywords.map((keyword) => (
                    <Chip key={keyword}>{keyword}</Chip>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="p-4">
              <AsideLabel>{strings.versions}</AsideLabel>
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
                        <Chip className="tabular-nums" tone={current ? "accent" : "neutral"}>
                          {template(strings.version, { version: version.version })}
                        </Chip>
                        <time
                          className="font-mono text-2xs tabular-nums text-ink-3"
                          dateTime={version.createdAt}
                          title={formatDateTime(version.createdAt, locale)}
                        >
                          {relativeTime(version.createdAt, locale)}
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

function AsideLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
      {children}
    </h2>
  );
}
