import Link from "next/link";
import { BrainNav } from "../../../components/brain-nav";
import { InviteMemberForm } from "../../../components/invite-member-form";
import { api } from "../../../lib/api";

interface BrainResponse {
  brain: { id: string; name: string; description: string; instructions: string };
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

export default async function BrainPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const data = await api<BrainResponse>(`/api/v1/brains/${brainId}`);
  return (
    <main className="shell brain-layout">
      <aside className="brain-aside">
        <Link className="back" href="/">
          ← All brains
        </Link>
        <BrainNav brainId={brainId} />
        <p className="kicker">Brain</p>
        <h1>{data.brain.name}</h1>
        <p>{data.brain.description}</p>
        {data.brain.instructions ? (
          <div className="instruction">
            <span>Instructions</span>
            {data.brain.instructions}
          </div>
        ) : null}
        <div className="aside-actions">
          <a href={`/brains/${brainId}/export`}>Export Markdown</a>
        </div>
        <InviteMemberForm brainId={brainId} />
      </aside>
      <section className="index-list">
        <div className="list-head">
          <span>{data.routingIndex.length} articles</span>
          <span>Current canon</span>
        </div>
        {data.routingIndex.length ? (
          data.routingIndex.map((article, index) => (
            <Link className="article-row" href={`/articles/${article.id}`} key={article.id}>
              <span className="row-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{article.title}</h2>
                <p>{article.summary}</p>
              </div>
              <div className="row-state">
                <span className={`status ${article.freshness}`}>
                  {article.freshness.replace("_", " ")}
                </span>
                <span>v{article.currentVersion}</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="empty-inline">
            The routing index is empty. Ask a connected agent to stage the first article.
          </div>
        )}
      </section>
    </main>
  );
}
