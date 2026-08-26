import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-dashed border-line bg-surface/50 px-6 py-10 text-center ${className ?? ""}`}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-2">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}
