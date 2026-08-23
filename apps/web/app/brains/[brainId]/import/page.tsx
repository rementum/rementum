import { BrainNav } from "../../../../components/brain-nav";
import { api } from "../../../../lib/api";
import { ImportPanel } from "./import-panel";

export default async function ImportPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const brain = await api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`);
  return (
    <main className="shell management-shell">
      <header className="management-head">
        <div>
          <p className="kicker">{brain.brain.name}</p>
          <h1>Import Markdown</h1>
        </div>
        <BrainNav brainId={brainId} />
      </header>
      <ImportPanel brainId={brainId} />
    </main>
  );
}
