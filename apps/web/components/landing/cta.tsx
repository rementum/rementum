"use client";

import Link from "next/link";
import { Button, CommunityBadge, FloatingSparkles, GradientText } from "../pui";
import { AURORA_HERO, AuroraBackdrop, LazyCanvas } from "../ui/backdrop";
import { Reveal } from "./reveal";

export function CTASection({ githubUrl }: { githubUrl: string }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-window border border-line bg-surface/60 px-6 py-16 text-center shadow-card sm:px-12 sm:py-20">
          <AuroraBackdrop blobs={AURORA_HERO} animated blur={80} />
          <LazyCanvas className="pointer-events-none absolute inset-0">
            <FloatingSparkles count={14} sizeRange={[8, 14]} />
          </LazyCanvas>
          <div className="relative">
            <GradientText
              as="h2"
              className="text-[clamp(30px,4vw,48px)] font-semibold tracking-tight"
            >
              Give your agents a memory.
            </GradientText>
            <p className="mx-auto mt-3 max-w-md text-base text-ink-2">
              Self-host it. Connect a client. Keep the history.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button as={Link} href="/auth/login" variant="glow" size="lg" sparkle>
                Get started
              </Button>
              <CommunityBadge
                href={githubUrl}
                iconNode={<GitHubGlyph />}
                title="Star us on GitHub"
                subtitle="AGPL-3.0 · self-hosted"
              />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function GitHubGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={18} height={18} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
