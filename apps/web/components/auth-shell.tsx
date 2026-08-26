import type { ReactNode } from "react";
import { EyebrowPill } from "./pui";
import { AURORA_SOFT, AuroraBackdrop } from "./ui/backdrop";

/** Shared two-column layout for signed-out auth and invitation pages. */
export function AuthShell({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex-1">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden opacity-60 [mask-image:linear-gradient(black,transparent)]">
        <AuroraBackdrop blobs={AURORA_SOFT} blur={110} />
      </div>
      <main className="relative mx-auto grid min-h-[70vh] w-full max-w-6xl gap-12 px-6 pb-24 pt-16 lg:grid-cols-2 lg:items-center">
        <section>
          <EyebrowPill>{kicker}</EyebrowPill>
          <h1 className="mt-4 text-[clamp(34px,4.5vw,52px)] font-medium leading-[1.05] tracking-tighter text-ink text-balance">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-base text-ink-2 text-pretty">{description}</p>
        </section>
        <section className="rounded-window border border-line bg-surface/70 p-6 shadow-card backdrop-blur-xl">
          {children}
        </section>
      </main>
    </div>
  );
}
