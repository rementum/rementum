"use client";

import { GlassCard } from "../pui";
import { RevealGroup, RevealItem } from "./reveal";
import { SectionHead } from "./section-head";

export function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20" id="features">
      <SectionHead kicker="Change safely" title="Change knowledge without silent overwrites.">
        Rementum separates proposals from canon. You review conflicts before a write replaces the
        current version.
      </SectionHead>
      <RevealGroup className="grid gap-4 md:grid-cols-3">
        <RevealItem>
          <GlassCard glowOnHover>
            <VersionsVisual />
            <GlassCard.Title>Versioned canon</GlassCard.Title>
            <GlassCard.Body>
              Readers see one current article. Older versions remain available for recovery.
            </GlassCard.Body>
          </GlassCard>
        </RevealItem>
        <RevealItem>
          <GlassCard breathing glowOnHover>
            <ConflictVisual />
            <GlassCard.Title>Conflict checks</GlassCard.Title>
            <GlassCard.Body>
              A proposal is parked when its base version no longer matches the live canon.
            </GlassCard.Body>
          </GlassCard>
        </RevealItem>
        <RevealItem>
          <GlassCard glowOnHover>
            <ExportVisual />
            <GlassCard.Title>Portable source</GlassCard.Title>
            <GlassCard.Body>
              Export brains as Markdown and keep storage under your control.
            </GlassCard.Body>
          </GlassCard>
        </RevealItem>
      </RevealGroup>
    </section>
  );
}

function VersionsVisual() {
  return (
    <div aria-hidden="true" className="mb-4 flex flex-col gap-1.5 font-mono text-2xs">
      <span className="w-fit rounded-chip border border-line bg-inset px-2 py-1 text-ink-3 line-through decoration-ink-3/50">
        v2
      </span>
      <span className="w-fit rounded-chip border border-green/25 bg-green/10 px-2 py-1 text-green">
        v3 · current
      </span>
    </div>
  );
}

function ConflictVisual() {
  return (
    <div aria-hidden="true" className="mb-4 flex flex-col gap-1.5 font-mono text-2xs">
      <span className="w-fit rounded-chip border border-line bg-inset px-2 py-1 text-ink-3">
        base v2
      </span>
      <span className="flex w-fit items-center gap-2">
        <span className="rounded-chip border border-line bg-inset px-2 py-1 text-ink-2">
          live v3
        </span>
        <span className="rounded-chip border border-orange/30 bg-orange/10 px-2 py-1 text-orange">
          parked
        </span>
      </span>
    </div>
  );
}

function ExportVisual() {
  return (
    <div aria-hidden="true" className="mb-4 flex items-center gap-2 font-mono text-2xs">
      <span className="rounded-chip border border-line bg-inset px-2 py-1 text-ink-2">
        brain.md
      </span>
      <span className="text-ink-3">→</span>
      <span className="rounded-chip border border-accent/30 bg-accent-tint px-2 py-1 text-accent">
        yours
      </span>
    </div>
  );
}
