import Link from "next/link";
import { Card, CardHeader } from "../../../components/ui/card";
import { Chip } from "../../../components/ui/chip";
import { StatusPill } from "../../../components/ui/status-pill";
import { api } from "../../../lib/api";
import { formatDateTime, relativeTime } from "../../../lib/format";
import { template } from "../../../lib/i18n/get-dictionary";
import { requestDictionary } from "../../../lib/i18n/server";
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
  const { locale, dict } = await requestDictionary();
  const strings = dict.tasks;
  const statuses: Record<string, string> = {
    open: strings.statusOpen,
    claimed: strings.statusClaimed,
    blocked: strings.statusBlocked,
    review: strings.statusReview,
    approved: strings.statusApproved,
    completed: strings.statusCompleted,
    cancelled: strings.statusCancelled,
  };

  const { taskId } = await params;
  const [task, comments] = await Promise.all([
    api<Task>(`/api/v1/tasks/${taskId}`),
    api<Comment[]>(`/api/v1/tasks/${taskId}/comments`),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <Link
        className="inline-flex items-center gap-1 font-mono text-2xs text-ink-3 transition-colors hover:text-ink"
        href={`/brains/${task.brainId}/tasks`}
      >
        {strings.back}
      </Link>
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={task.priority > 0 ? "orange" : "neutral"}>
            <span className="tabular-nums">
              {template(strings.priorityValue, { priority: task.priority })}
            </span>
          </Chip>
          <StatusPill status={task.status} label={statuses[task.status] ?? task.status} />
        </div>
        <h1 className="mt-2.5 text-[19px] font-semibold tracking-tight text-ink">{task.title}</h1>
        <p className="mt-1.5 max-w-2xl whitespace-pre-wrap text-sm text-ink-2">{task.brief}</p>
      </header>
      <section className="mt-8">
        <Card>
          <CardHeader title={strings.comments} count={comments.length} />
          {comments.length ? (
            <div className="divide-y divide-line">
              {comments.map((comment) => (
                <article className="px-4 py-3" key={comment.id}>
                  <p className="whitespace-pre-wrap text-sm text-ink">{comment.body}</p>
                  <p className="mt-2 flex items-center gap-2 font-mono text-2xs text-ink-3">
                    <Chip>{comment.clientId ?? comment.actorId}</Chip>
                    <time
                      className="tabular-nums"
                      dateTime={comment.createdAt}
                      title={formatDateTime(comment.createdAt, locale)}
                    >
                      {relativeTime(comment.createdAt, locale)}
                    </time>
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="px-4 py-4 text-sm text-ink-3">{strings.noComments}</p>
          )}
        </Card>
      </section>
      <div className="mt-6">
        <TaskCommentForm strings={strings} taskId={taskId} />
      </div>
    </main>
  );
}
