import { PageHeader } from "../../../../components/ui/page-header";
import { api } from "../../../../lib/api";
import { template } from "../../../../lib/i18n/get-dictionary";
import { requestDictionary } from "../../../../lib/i18n/server";
import { renderTerms } from "../../../../lib/i18n/terms";
import { ArticleEditForm } from "./article-edit-form";

interface Article {
  id: string;
  brainId: string;
  slug: string;
  title: string;
  summary: string;
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
  const { dict } = await requestDictionary();
  const strings = dict.articles;
  const { articleId } = await params;
  const article = await api<Article>(`/api/v1/articles/${articleId}`);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        back={{ href: `/articles/${articleId}`, label: strings.article }}
        kicker={renderTerms(strings.stageOnly)}
        title={template(strings.editTitle, { title: article.title })}
        description={strings.editDescription}
      />
      <div className="mt-8">
        <ArticleEditForm strings={strings} article={article} />
      </div>
    </main>
  );
}
