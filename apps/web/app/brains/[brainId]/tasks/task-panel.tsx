"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, WibblingSpinner } from "../../../../components/pui";
import { Card } from "../../../../components/ui/card";
import { Chip } from "../../../../components/ui/chip";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Field, fieldControlClass } from "../../../../components/ui/field";
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

const ghostButtonClass =
  "rounded-control px-2 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50 active:scale-[0.98]";

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
      <Card>
        <details className="group">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-2.5 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            New task
            <span
              aria-hidden="true"
              className="text-sm leading-none transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <form className="grid gap-4 border-t border-dashed border-line p-4" action={create}>
            <Field label="Title" htmlFor="task-title">
              <input
                className={fieldControlClass}
                id="task-title"
                name="title"
                required
                maxLength={240}
              />
            </Field>
            <Field label="Brief" htmlFor="task-brief">
              <textarea
                className={`${fieldControlClass} min-h-24`}
                id="task-brief"
                name="brief"
                required
                maxLength={20000}
              />
            </Field>
            <Field label="Priority" htmlFor="task-priority">
              <input
                className={`${fieldControlClass} max-w-32 tabular-nums`}
                id="task-priority"
                name="priority"
                type="number"
                min="-100"
                max="100"
                defaultValue="0"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button variant="solid" size="sm" disabled={busy === "create"} type="submit">
                Create task
              </Button>
              {busy === "create" ? (
                <WibblingSpinner className="text-xs text-ink-3" verbs={["Creating"]} />
              ) : null}
            </div>
          </form>
        </details>
      </Card>
      {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
      <section className="mt-6">
        {initialTasks.length ? (
          <Card>
            <div className="divide-y divide-line">
              {initialTasks.map((task) => (
                <article className="flex items-start gap-4 px-4 py-3" key={task.id}>
                  <StatusPill className="mt-0.5" status={task.status} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-ink">
                      <Link
                        className="transition-colors hover:text-accent"
                        href={`/tasks/${task.id}`}
                      >
                        {task.title}
                      </Link>
                    </h2>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{task.brief}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Chip tone={task.priority > 0 ? "orange" : "neutral"}>
                      <span className="tabular-nums">P{task.priority}</span>
                    </Chip>
                    {busy === task.id ? (
                      <WibblingSpinner className="text-xs text-ink-3" verbs={["Updating"]} />
                    ) : null}
                    {!["completed", "cancelled"].includes(task.status) ? (
                      <>
                        <button
                          className={ghostButtonClass}
                          type="button"
                          onClick={() => transition(task.id, "review")}
                          disabled={busy === task.id}
                        >
                          Review
                        </button>
                        <button
                          className={ghostButtonClass}
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
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState title="No tasks in the queue." />
        )}
      </section>
    </>
  );
}
