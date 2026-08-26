import type { ReactNode } from "react";

export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-card bg-surface shadow-card ${
        interactive ? "transition-shadow duration-150 hover:shadow-raised" : ""
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  count,
  action,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 border-b border-dashed border-line px-4 py-2.5 ${className ?? ""}`}
    >
      <h2 className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        {title}
      </h2>
      {count != null ? (
        <span className="font-mono text-2xs tabular-nums text-ink-3">{count}</span>
      ) : null}
      {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
