import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  back,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-4 ${className ?? ""}`}>
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="mb-3 inline-flex items-center gap-1 font-mono text-2xs text-ink-3 transition-colors hover:text-ink"
          >
            ← {back.label}
          </Link>
        ) : null}
        {kicker ? (
          <p className="mb-1.5 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-gradient-to-r from-grad-from to-grad-to"
            />
            {kicker}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
