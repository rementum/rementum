import Link from "next/link";
import { ArticleMarkdown } from "../../../components/article-markdown";
import { api } from "../../../lib/api";

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
  const { articleId } = await params;
  const [article, history] = await Promise.all([
    api<Article>(`/api/v1/articles/${articleId}`),
    api<Version[]>(`/api/v1/articles/${articleId}/history`),
  ]);
  return (
    <main className="article-shell">
      <header className="article-header">
        <Link className="back" href={`/brains/${article.brainId}`}>
          ← Routing index
        </Link>
        <Link className="edit-link" href={`/articles/${articleId}/edit`}>
          Stage an edit
        </Link>
        <div className="article-title">
          <div>
            <p className="kicker">Canonical article · v{article.currentVersion}</p>
            <h1>{article.title}</h1>
            <p>{article.summary}</p>
          </div>
          <span className={`status ${article.freshness}`}>{article.freshness}</span>
        </div>
      </header>
      <div className="article-columns">
        <article className="markdown">
          <ArticleMarkdown body={article.body} />
        </article>
        <aside className="provenance">
          <span>Latest change</span>
          <strong>{article.provenance.changeSummary}</strong>
          <p>
            {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(article.provenance.createdAt),
            )}
          </p>
          <p className="mono">{article.provenance.clientId ?? "web"}</p>
          <div className="version-stack">
            <span>Version history</span>
            {history.map((version) => (
              <div key={version.id}>
                <strong>v{version.version}</strong>
                <p>{version.changeSummary}</p>
                <time>{new Date(version.createdAt).toLocaleDateString()}</time>
              </div>
            ))}
          </div>
          {article.keywords.length ? (
            <div className="tags">
              {article.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
