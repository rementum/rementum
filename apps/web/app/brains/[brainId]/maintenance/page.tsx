import { BrainNav } from "../../../../components/brain-nav";
import { api } from "../../../../lib/api";
import { MaintenanceActions } from "./maintenance-actions";

interface Candidate {
  id: string;
  kind: string;
  articleIds: string[];
  score: number | null;
  detail: Record<string, unknown>;
  status: string;
  createdAt: string;
}

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ brainId: string }>;
}) {
  const { brainId } = await params;
  const [brain, candidates] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`),
    api<Candidate[]>(`/api/v1/brains/${brainId}/maintenance`),
  ]);
  return (
    <main className="shell management-shell">
      <header className="management-head">
        <div>
          <p className="kicker">{brain.brain.name}</p>
          <h1>Knowledge health</h1>
        </div>
        <BrainNav brainId={brainId} />
      </header>
      <MaintenanceActions brainId={brainId} candidates={candidates} />
    </main>
  );
}
