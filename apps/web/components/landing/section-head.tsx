import type { ReactNode } from "react";
import { Reveal } from "./reveal";

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
    <div className="mb-12 max-w-2xl">
      <Reveal>
        {kicker ? (
          <p className="mb-2 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-ink-3">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-gradient-to-r from-grad-from to-grad-to"
            />
            {kicker}
          </p>
        ) : null}
        <h2 className="text-[clamp(28px,3.2vw,40px)] font-semibold leading-tight tracking-tight text-ink text-balance">
          {title}
        </h2>
        {children ? <p className="mt-3 text-base text-ink-2 text-pretty">{children}</p> : null}
      </Reveal>
    </div>
  );
}
