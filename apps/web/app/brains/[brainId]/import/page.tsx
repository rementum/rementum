import { BrainNav } from "../../../../components/brain-nav";
import { PageHeader } from "../../../../components/ui/page-header";
import { api } from "../../../../lib/api";
import { ImportPanel } from "./import-panel";

export default async function ImportPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const brain = await api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={brain.brain.name} title="Import Markdown" />
      <div className="mt-6">
        <BrainNav brainId={brainId} />
      </div>
      <div className="mt-8">
        <ImportPanel brainId={brainId} />
      </div>
    </main>
  );
}
