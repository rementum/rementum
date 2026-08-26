"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill } from "../../../../components/ui/status-pill";

interface Task {
  id: string;
  title: string;
  brief: string;
  priority: number;
  status: string;
  claimedBy: string | null;
  leaseExpiresAt: string | null;
}

export function TaskPanel({ brainId, initialTasks }: { brainId: string; initialTasks: Task[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function create(formData: FormData) {
    setBusy("create");
    const response = await fetch("/bridge/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brainId,
        title: formData.get("title"),
        brief: formData.get("brief"),
        priority: Number(formData.get("priority") ?? 0),
        articleIds: [],
        links: [],
      }),
    });
    if (!response.ok) setError("Could not create task.");
    else router.refresh();
    setBusy("");
  }
  async function transition(taskId: string, status: string) {
    setBusy(taskId);
    const response = await fetch(`/bridge/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) setError("Could not update task.");
    else router.refresh();
    setBusy("");
  }
  return (
    <>
      <form className="task-create" action={create}>
        <label>
          Title
          <input name="title" required maxLength={240} />
        </label>
        <label>
          Brief
          <textarea name="brief" required maxLength={20000} />
        </label>
        <label>
          Priority
          <input name="priority" type="number" min="-100" max="100" defaultValue="0" />
        </label>
        <button className="button" disabled={busy === "create"} type="submit">
          Create task
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      <section className="task-list">
        {initialTasks.length ? (
          initialTasks.map((task) => (
            <article className="task-item" key={task.id}>
              <div>
                <StatusPill status={task.status} />
                <h2>
                  <Link href={`/tasks/${task.id}`}>{task.title}</Link>
                </h2>
                <p>{task.brief}</p>
              </div>
              <div className="task-controls">
                <span className="mono">P{task.priority}</span>
                {!["completed", "cancelled"].includes(task.status) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => transition(task.id, "review")}
                      disabled={busy === task.id}
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={() => transition(task.id, "completed")}
                      disabled={busy === task.id}
                    >
                      Complete
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-inline">No tasks in the queue.</div>
        )}
      </section>
    </>
  );
}
