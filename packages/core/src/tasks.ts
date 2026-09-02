import type { TaskStatus } from "@rementum/contracts";

/**
 * Status changes an update may make. `claimed` is reached only through a claim, and a
 * terminal task can only be reopened; everything else used to be reachable from anywhere,
 * so a task could be approved without ever being reviewed or completed twice.
 */
const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["blocked", "review", "completed", "cancelled"],
  claimed: ["open", "blocked", "review", "completed", "cancelled"],
  blocked: ["open", "review", "completed", "cancelled"],
  review: ["open", "blocked", "approved", "completed", "cancelled"],
  approved: ["open", "completed", "cancelled"],
  completed: ["open"],
  cancelled: ["open"],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TASK_TRANSITIONS[from].includes(to);
}
