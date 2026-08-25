import Link from "next/link";
import { api } from "../../../../lib/api";
import { ArticleEditForm } from "./article-edit-form";

interface Article {
  id: string;
  brainId: string;
  slug: string;
  title: string;
  body: string;
  kind: "canonical" | "log";
  keywords: string[];
  currentVersion: number;
}

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const article = await api<Article>(`/api/v1/articles/${articleId}`);
  return (
    <main className="shell management-shell">
      <Link className="back" href={`/articles/${articleId}`}>
        ← Article
      </Link>
      <header className="management-head">
        <div>
          <p className="kicker">Stage only</p>
          <h1>Edit {article.title}</h1>
          <p>Saving creates a reviewable staged write. Canon is unchanged until promotion.</p>
        </div>
      </header>
      <ArticleEditForm article={article} />
    </main>
  );
}
