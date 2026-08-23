import Link from "next/link";
import { api } from "../../../lib/api";
import { TaskCommentForm } from "./task-comment-form";

interface Task {
  id: string;
  brainId: string;
  title: string;
  brief: string;
  status: string;
  priority: number;
  claimedBy: string | null;
  leaseExpiresAt: string | null;
}
interface Comment {
  id: string;
  body: string;
  actorId: string;
  clientId: string | null;
  createdAt: string;
}

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const [task, comments] = await Promise.all([
    api<Task>(`/api/v1/tasks/${taskId}`),
    api<Comment[]>(`/api/v1/tasks/${taskId}/comments`),
  ]);
  return (
    <main className="shell management-shell">
      <Link className="back" href={`/brains/${task.brainId}/tasks`}>
        ← Agent queue
      </Link>
      <header className="write-head">
        <div>
          <p className="kicker">Task · P{task.priority}</p>
          <h1>{task.title}</h1>
          <p>{task.brief}</p>
        </div>
        <span className={`status ${task.status}`}>{task.status}</span>
      </header>
      <section className="comment-list">
        {comments.map((comment) => (
          <article key={comment.id}>
            <p>{comment.body}</p>
            <span className="mono">
              {comment.clientId ?? comment.actorId} · {new Date(comment.createdAt).toLocaleString()}
            </span>
          </article>
        ))}
      </section>
      <TaskCommentForm taskId={taskId} />
    </main>
  );
}
