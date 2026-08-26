import { PageHeader } from "../../../../components/ui/page-header";
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
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        back={{ href: `/articles/${articleId}`, label: "Article" }}
        kicker="Stage only"
        title={`Edit ${article.title}`}
        description="Saving creates a reviewable staged write. Canon is unchanged until promotion."
      />
      <div className="mt-8">
        <ArticleEditForm article={article} />
      </div>
    </main>
  );
}
