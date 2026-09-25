import { BrainNav } from "../../../../components/brain-nav";
import { PageHeader } from "../../../../components/ui/page-header";
import { api } from "../../../../lib/api";
import { requestDictionary } from "../../../../lib/i18n/server";
import { TaskPanel } from "./task-panel";

interface Task {
  id: string;
  title: string;
  brief: string;
  priority: number;
  status: string;
  claimedBy: string | null;
  leaseExpiresAt: string | null;
}

export default async function TasksPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { dict } = await requestDictionary();
  const strings = dict.tasks;
  const { brainId } = await params;
  const [brain, tasks] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`),
    api<Task[]>(`/api/v1/brains/${brainId}/tasks`),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={brain.brain.name} title={strings.title} />
      <div className="mt-6">
        <BrainNav strings={dict.brains} brainId={brainId} />
      </div>
      <div className="mt-8">
        <TaskPanel strings={strings} brainId={brainId} initialTasks={tasks} />
      </div>
    </main>
  );
}
