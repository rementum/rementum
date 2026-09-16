import type { ReactNode } from "react";

export function SectionHead({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-10 max-w-2xl">
      {kicker ? <p className="mb-3 text-ink-3 text-xs">{kicker}</p> : null}
      <h2 className="text-balance font-medium text-[clamp(28px,3vw,38px)] text-ink leading-tight tracking-tight">
        {title}
      </h2>
      {children ? (
        <p className="mt-4 max-w-[55ch] text-base text-ink-2 leading-relaxed">{children}</p>
      ) : null}
    </div>
  );
}
