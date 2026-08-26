import type { ReactNode } from "react";

/** Shared control styling for inputs, selects, and textareas. */
export const fieldControlClass =
  "w-full rounded-control border border-line bg-field px-3 py-2 text-sm text-ink shadow-hairline transition-colors placeholder:text-ink-3 hover:border-line-strong";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label
        htmlFor={htmlFor}
        className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
