import { BrainNav } from "../../../../components/brain-nav";
import { PageHeader } from "../../../../components/ui/page-header";
import { api } from "../../../../lib/api";
import { requestDictionary } from "../../../../lib/i18n/server";
import { ImportPanel } from "./import-panel";

export default async function ImportPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { dict } = await requestDictionary();
  const strings = dict.brains;
  const { brainId } = await params;
  const brain = await api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={brain.brain.name} title={strings.importTitle} />
      <div className="mt-6">
        <BrainNav strings={dict.brains} brainId={brainId} />
      </div>
      <div className="mt-8">
        <ImportPanel strings={strings} brainId={brainId} />
      </div>
    </main>
  );
}
