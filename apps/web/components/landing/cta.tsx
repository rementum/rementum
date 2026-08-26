"use client";

import Link from "next/link";
import { Button, CommunityBadge, FloatingSparkles, GradientText } from "../pui";
import { AURORA_HERO, AuroraBackdrop, LazyCanvas } from "../ui/backdrop";
import { IconGitHub } from "../ui/icons";
import { Reveal } from "./reveal";

export function CTASection({ githubUrl }: { githubUrl: string }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-window border border-line bg-surface/60 px-6 py-16 text-center shadow-card sm:px-12 sm:py-20">
          <LazyCanvas className="pointer-events-none absolute inset-0">
            <AuroraBackdrop blobs={AURORA_HERO} animated blur={80} />
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
              <Button as={Link} href="/auth/login" variant="solid" size="lg" sparkle>
                Get started
              </Button>
              <CommunityBadge
                href={githubUrl}
                iconNode={<IconGitHub className="size-[18px]" />}
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
