"use client";

import { useEffect, useRef } from "react";
import { GradientText } from "../pui";
import type { PromoController } from "./promo/mount";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";

const STEPS = [
  {
    num: "01",
    title: "Compact Routing Index",
    desc: "Agents never load the entire memory. They query a fast, token-efficient index to find only the exact article needed.",
  },
  {
    num: "02",
    title: "Staged Write Isolation",
    desc: "Proposed changes are staged in an isolated buffer against the base version, completely separate from live canon.",
  },
  {
    num: "03",
    title: "Conflict Resolution Shield",
    desc: "Rementum checks if the article changed while the agent was working. Conflicts are parked safely instead of overwriting.",
  },
  {
    num: "04",
    title: "Immutable Versioned Canon",
    desc: "On promotion, changes are encrypted with AES-256-GCM, committed as an audited version, and shared instantly.",
  },
];

const DESCRIPTION =
  "Illustrated overview: agents read a compact index, stage writes, and share one versioned brain";

/* Tailwind's `md` breakpoint; the window below carries the matching `hidden md:block`. */
const SHOW_ANIMATION = "(min-width: 48rem)";

export function HowItWorks() {
  const host = useRef<HTMLDivElement>(null);

  // The animation engine is a separate chunk and only runs in the browser: it measures text, so it
  // needs the real fonts. It starts on its own and plays only while the window is on screen.
  // Below the `md` breakpoint the window is hidden (the 1920px stage shrinks past legibility on a
  // phone) and the engine is never loaded; the same query keeps the two in step, because text
  // measured inside a `display: none` box comes back as zero and would break the layout.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wide = window.matchMedia(SHOW_ANIMATION);
    let cancelled = false;
    let loading = false;
    let mounted: PromoController | undefined;
    let observer: IntersectionObserver | undefined;
    const unmount = () => {
      observer?.disconnect();
      observer = undefined;
      mounted?.destroy();
      mounted = undefined;
    };
    const sync = () => {
      if (!wide.matches) {
        unmount();
        return;
      }
      if (mounted || loading) return;
      loading = true;
      import("./promo/mount").then(({ mountPromo }) => {
        loading = false;
        if (cancelled || !wide.matches) return;
        mounted = mountPromo(element);
        observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry) return;
            if (entry.isIntersecting) mounted?.play();
            else mounted?.pause();
          },
          { threshold: 0.2 },
        );
        observer.observe(element);
      });
    };
    sync();
    wide.addEventListener("change", sync);
    return () => {
      cancelled = true;
      wide.removeEventListener("change", sync);
      unmount();
    };
  }, []);

  return (
    <section
      className="relative mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16"
      id="how-it-works"
    >
      <SectionHead
        kicker="How it works"
        title={
          <>
            Simple architecture. <GradientText>Zero collisions.</GradientText>
          </>
        }
      >
        How Cursor, Claude Code, and Codex stay perfectly synchronized without overwriting each
        other<span className="hidden md:inline">, in 45 seconds</span>.
      </SectionHead>

      <Reveal delay={0.1}>
        <div className="relative mx-auto max-w-5xl">
          {/* The animated window; phones get the step cards alone */}
          <div className="relative hidden md:block">
            {/* Subtle teal aurora glow behind the window */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgb(74_164_143/20%),transparent_70%)] blur-2xl"
            />

            {/* Window Container */}
            <div className="relative overflow-hidden rounded-window border border-line-strong/60 bg-surface/80 shadow-raised backdrop-blur-xl">
              {/* Window Chrome Header */}
              <div className="flex h-10 items-center gap-2 border-line/60 border-b bg-surface-2/40 px-4">
                <span className="size-2.5 rounded-full bg-[#FF5F57]/80" />
                <span className="size-2.5 rounded-full bg-[#F59E0B]/80" />
                <span className="size-2.5 rounded-full bg-[#4AA48F]/80" />
                <span className="ml-2 font-mono text-2xs text-ink-3">how-it-works</span>
              </div>

              {/* Stage: a 1920x1080 canvas the engine scales to this box */}
              <div
                ref={host}
                role="img"
                aria-label={DESCRIPTION}
                className="relative aspect-[16/9] w-full overflow-hidden bg-[#0b1614]"
              >
                <noscript>
                  {/* biome-ignore lint/performance/noImgElement: next/image needs JavaScript, and this is the no-JavaScript fallback */}
                  <img
                    alt={DESCRIPTION}
                    className="absolute inset-0 size-full object-cover"
                    src="/assets/rementum-promo-poster.jpg"
                  />
                </noscript>
              </div>
            </div>
          </div>

          {/* 4-Step Architecture Highlights */}
          <div className="grid gap-4 sm:grid-cols-2 md:mt-8 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="rounded-card border border-line/60 bg-surface/60 p-4 shadow-hairline backdrop-blur-sm transition-colors hover:border-line-strong hover:bg-surface/80"
              >
                <span className="font-mono font-semibold text-accent text-xs">{step.num}</span>
                <h3 className="mt-1 font-medium text-ink text-sm">{step.title}</h3>
                <p className="mt-1.5 text-ink-2 text-xs leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
