"use client";

import { useReducedMotion } from "motion/react";
import { EyebrowPill, StatCounter } from "../pui";
import { Reveal } from "./reveal";

const STATS: Array<{ value: number | string; label: string; format?: (n: number) => string }> = [
  { value: 31, label: "MCP tools exposed" },
  { value: 4, label: "steps from question to canon" },
  { value: 0, label: "silent overwrites, by design" },
  { value: "AGPL-3.0", label: "self-hosted and yours" },
];

export function StatsBand() {
  const reduce = useReducedMotion();
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <Reveal className="mb-10">
        <EyebrowPill icon={false}>Built to be checked</EyebrowPill>
      </Reveal>
      <Reveal>
        <dl className="grid grid-cols-2 gap-y-10 md:grid-cols-4 md:divide-x md:divide-dashed md:divide-line">
          {STATS.map((stat) => (
            <div key={stat.label} className="md:px-8 md:first:pl-0 md:last:pr-0">
              <dd className="bg-gradient-to-r from-grad-from via-grad-mid to-grad-to bg-clip-text font-mono text-[28px] font-semibold tabular-nums leading-none text-transparent">
                {typeof stat.value === "number" ? (
                  reduce ? (
                    stat.value
                  ) : (
                    <StatCounter target={stat.value} durationMs={1600} />
                  )
                ) : (
                  stat.value
                )}
              </dd>
              <dt className="mt-2 text-sm text-ink-2">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
