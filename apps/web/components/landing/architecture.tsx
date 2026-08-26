"use client";

import { NodeGraphBackground } from "../pui";
import { LazyCanvas } from "../ui/backdrop";
import { GREEN_LINK, GREEN_PALETTE } from "./palette";
import { RevealGroup, RevealItem } from "./reveal";
import { SectionHead } from "./section-head";

const NODES = [
  ["Clients", "Codex, Claude Code, OpenCode"],
  ["Gateway", "Caddy, OAuth, MCP"],
  ["Application", "Fastify, Next.js, local summaries or AI compaction"],
  ["Storage", "PostgreSQL, pgvector, Markdown"],
] as const;

export function Architecture() {
  return (
    <section className="relative scroll-mt-20 overflow-hidden py-20" id="architecture">
      <LazyCanvas className="absolute inset-0 opacity-60 dark:opacity-100">
        <NodeGraphBackground
          density={44}
          colors={GREEN_PALETTE}
          linkColor={GREEN_LINK}
          baseOpacity={0.35}
          hoverBrighten={0.8}
          speed={0.3}
        />
      </LazyCanvas>
      <div className="pointer-events-none relative mx-auto w-full max-w-6xl px-6">
        <div className="pointer-events-auto">
          <SectionHead kicker="Self-hosted" title="Run it on your own stack.">
            You control OAuth, MCP, search, embeddings, and storage. Article generation stays local
            unless you enable an OpenAI-compatible AI provider to compact staged knowledge.
          </SectionHead>
        </div>
        <RevealGroup className="pointer-events-auto grid gap-3 md:grid-cols-4" role="list">
          {NODES.map(([title, body], i) => (
            <RevealItem
              key={title}
              role="listitem"
              className={`relative rounded-card border border-line bg-surface/75 p-4 shadow-hairline backdrop-blur-md ${
                i < NODES.length - 1
                  ? "md:after:absolute md:after:top-1/2 md:after:-right-3 md:after:w-3 md:after:border-t md:after:border-dashed md:after:border-line-strong"
                  : ""
              }`}
            >
              <span className="font-mono text-2xs uppercase tracking-[0.12em] text-ink-3">
                {title}
              </span>
              <strong className="mt-1.5 block text-sm font-medium leading-snug text-ink">
                {body}
              </strong>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
