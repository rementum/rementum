"use client";

import { LogoMarquee } from "../pui";

const ITEMS = [
  "MCP-native",
  "OAuth per agent",
  "pgvector search",
  "local summaries or AI compaction",
  "versioned canon",
  "audit trail",
  "Markdown export",
  "conflict-safe writes",
  "self-hosted",
  "AGPL-3.0",
];

export function CapabilityMarquee() {
  return (
    <div className="border-y border-dashed border-line py-4">
      <LogoMarquee
        speed={36}
        gap={48}
        fade
        pauseOnHover
        logos={ITEMS.map((label) => ({
          kind: "node" as const,
          key: label,
          node: (
            <span className="font-mono text-2xs uppercase tracking-[0.1em] text-ink-3">
              {label}
            </span>
          ),
        }))}
      />
    </div>
  );
}
