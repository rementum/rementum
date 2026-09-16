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
      className={`rounded-card border border-line bg-surface ${
        interactive ? "transition-colors duration-150 hover:border-line-strong" : ""
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
    <div className={`flex items-center gap-2 border-line border-b px-4 py-3 ${className ?? ""}`}>
      <h2 className="font-medium text-ink text-sm">{title}</h2>
      {count != null ? (
        <span className="font-mono text-2xs text-ink-3 tabular-nums">{count}</span>
      ) : null}
      {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
