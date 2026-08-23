import { BrainNav } from "../../../../components/brain-nav";
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
    <main className="shell management-shell">
      <header className="management-head">
        <div>
          <p className="kicker">{brain.brain.name}</p>
          <h1>Agent queue</h1>
        </div>
        <BrainNav brainId={brainId} />
      </header>
      <TaskPanel brainId={brainId} initialTasks={tasks} />
    </main>
  );
}
