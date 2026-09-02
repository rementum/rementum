"use client";

import { DOCS_URL } from "../../lib/site";
import { Button, GradientText } from "../pui";
import { IconCheck } from "../ui/icons";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";

const ADVANTAGES = [
  "Free forever, with no seats, usage caps, or paywalled features",
  "Your data stays on your server; the master key never leaves it",
  "Unlimited brains, workspaces, agents, and versions",
  "Full source under AGPL-3.0 to audit, fork, and extend",
  "Bring your own AI provider, or run on local models alone",
];

const CONSIDERATIONS = [
  "You provide the Linux host, a domain, and open ports 80 and 443",
  "You run updates, encrypted backups, and the occasional migration",
  "Scaling and uptime are yours to size and monitor",
  "No hosted SaaS tier; self-hosting is the only path today",
];

export function Pricing() {
  return (
    <section
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20"
      id="pricing"
      tabIndex={-1}
    >
      <SectionHead
        kicker="Pricing"
        title={
          <>
            Free forever. <GradientText>Self-hosted</GradientText> by design.
          </>
        }
      >
        Rementum is open source, with no paid tier and no per-seat billing. You run it on your own
        hardware and own every byte.
      </SectionHead>
      <Reveal>
        <div className="grid overflow-clip rounded-window border border-line bg-surface/60 shadow-card md:grid-cols-[minmax(0,300px)_1fr]">
          <div className="flex flex-col justify-between gap-8 border-b border-line bg-inset p-8 md:border-r md:border-b-0">
            <div>
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-3">
                Self-hosted
              </p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[52px] font-semibold leading-none tracking-tighter text-ink">
                  $0
                </span>
                <span className="text-sm text-ink-3">/ forever</span>
              </div>
              <p className="mt-3 text-sm text-ink-2 text-pretty">
                Clone it, run one install script, and connect an agent over MCP.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <Button as="a" href="/auth/login" variant="solid" size="lg" sparkle>
                Get started
              </Button>
              <Button as="a" href={`${DOCS_URL}installation/`} variant="ghost" size="sm">
                Read the install guide
              </Button>
            </div>
          </div>
          <div className="grid gap-8 p-8 sm:grid-cols-2">
            <div>
              <p className="mb-4 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.12em] text-green">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-green" />
                What you get
              </p>
              <ul className="flex flex-col gap-3">
                {ADVANTAGES.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-ink-2">
                    <IconCheck className="mt-0.5 shrink-0 text-green" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-4 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.12em] text-ink-3">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-3" />
                What to plan for
              </p>
              <ul className="flex flex-col gap-3">
                {CONSIDERATIONS.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-ink-3">
                    <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-ink-3/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
