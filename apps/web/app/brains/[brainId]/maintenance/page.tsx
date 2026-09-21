import { BrainNav } from "../../../../components/brain-nav";
import { PageHeader } from "../../../../components/ui/page-header";
import { api } from "../../../../lib/api";
import { requestDictionary } from "../../../../lib/i18n/server";
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
  const { dict } = await requestDictionary();
  const strings = dict.brains;
  const { brainId } = await params;
  const [brain, candidates] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`),
    api<Candidate[]>(`/api/v1/brains/${brainId}/maintenance`),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={brain.brain.name} title={strings.maintenanceTitle} />
      <div className="mt-6">
        <BrainNav strings={dict.brains} brainId={brainId} />
      </div>
      <div className="mt-8">
        <MaintenanceActions strings={strings} brainId={brainId} candidates={candidates} />
      </div>
    </main>
  );
}
