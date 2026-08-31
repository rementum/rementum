import type { ArticleGraph } from "@rementum/contracts";
import { BrainNav } from "../../../../components/brain-nav";
import { PageHeader } from "../../../../components/ui/page-header";
import { api } from "../../../../lib/api";
import { GraphShellClient } from "./graph-shell-client";

export default async function GraphPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const [brain, graph] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}?limit=1`),
    api<ArticleGraph>(`/api/v1/brains/${brainId}/graph`),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-6 pb-20 pt-10">
      <PageHeader
        kicker={brain.brain.name}
        title="Relation graph"
        description="Explore body-derived wiki links and manual relations across the complete brain."
      />
      <div className="mt-6">
        <BrainNav brainId={brainId} />
      </div>
      <div className="mt-6">
        <GraphShellClient graph={graph} />
      </div>
    </main>
  );
}
