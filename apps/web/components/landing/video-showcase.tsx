"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GradientText } from "../pui";
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

export function VideoShowcase() {
  const reduce = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // React does not serialize `muted` into server-rendered HTML, and browsers refuse to autoplay a
  // video that was not muted when it loaded, so mute and start it here instead of relying on
  // the `autoPlay` attribute. A visitor who prefers reduced motion gets the poster and a button.
  useEffect(() => {
    const element = video.current;
    if (!element || reduce) return;
    element.muted = true;
    element.play().catch(() => {});
  }, [reduce]);

  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => {});
    else element.pause();
  };

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
        other, in 45 seconds.
      </SectionHead>

      <Reveal delay={0.1}>
        <div className="relative mx-auto max-w-5xl">
          {/* Subtle teal aurora glow behind the video */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgb(74_164_143/20%),transparent_70%)] blur-2xl"
          />

          {/* Window Container */}
          <div className="relative overflow-hidden rounded-window border border-line-strong/60 bg-surface/80 shadow-raised backdrop-blur-xl">
            {/* Window Chrome Header */}
            <div className="flex h-10 items-center justify-between border-line/60 border-b bg-surface-2/40 px-4">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-[#FF5F57]/80" />
                <span className="size-2.5 rounded-full bg-[#F59E0B]/80" />
                <span className="size-2.5 rounded-full bg-[#4AA48F]/80" />
                <span className="ml-2 font-mono text-2xs text-ink-3">rementum-promo.mp4</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green/30 bg-green/10 px-2.5 py-0.5 font-mono text-3xs text-green">
                  <span className="size-1.5 animate-pulse rounded-full bg-green" />
                  45S OVERVIEW
                </span>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={playing ? "Pause the overview video" : "Play the overview video"}
                  className="inline-flex items-center rounded-full border border-line/60 bg-surface-2/60 px-2.5 py-0.5 font-mono text-3xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                >
                  {playing ? "PAUSE" : "PLAY"}
                </button>
              </div>
            </div>

            {/* Video */}
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0b1614]">
              <video
                ref={video}
                className="absolute inset-0 size-full object-cover"
                src="/assets/rementum-promo.mp4"
                poster="/assets/rementum-promo-poster.jpg"
                muted
                loop
                playsInline
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                aria-label="Illustrated overview: agents read a compact index, stage writes, and share one versioned brain"
              />
            </div>
          </div>

          {/* 4-Step Architecture Highlights */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
