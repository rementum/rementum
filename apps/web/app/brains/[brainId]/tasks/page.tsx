import { BrainNav } from "../../../../components/brain-nav";
import { PageHeader } from "../../../../components/ui/page-header";
import { api } from "../../../../lib/api";
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
  const { brainId } = await params;
  const [brain, tasks] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`),
    api<Task[]>(`/api/v1/brains/${brainId}/tasks`),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={brain.brain.name} title="Agent queue" />
      <div className="mt-6">
        <BrainNav brainId={brainId} />
      </div>
      <div className="mt-8">
        <TaskPanel brainId={brainId} initialTasks={tasks} />
      </div>
    </main>
  );
}
