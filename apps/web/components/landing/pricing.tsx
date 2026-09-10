"use client";

import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { DOCS_URL } from "../../lib/site";
import { Button, GradientText } from "../pui";
import { IconCheck } from "../ui/icons";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";

export function Pricing({ dict }: { dict: Dictionary }) {
  const pricing = dict.pricing;
  return (
    <section
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20"
      id="pricing"
      tabIndex={-1}
    >
      <SectionHead
        kicker={pricing.kicker}
        title={
          <>
            {pricing.titleA} <GradientText>{pricing.titleB}</GradientText> {pricing.titleC}
          </>
        }
      >
        {pricing.subtitle}
      </SectionHead>
      <Reveal>
        <div className="grid overflow-clip rounded-window border border-line bg-surface/60 shadow-card md:grid-cols-[minmax(0,300px)_1fr]">
          <div className="flex flex-col justify-between gap-8 border-b border-line bg-inset p-8 md:border-r md:border-b-0">
            <div>
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-3">
                {pricing.planLabel}
              </p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[52px] font-semibold leading-none tracking-tighter text-ink">
                  {pricing.price}
                </span>
                <span className="text-sm text-ink-3">{pricing.priceNote}</span>
              </div>
              <p className="mt-3 text-sm text-ink-2 text-pretty">{pricing.priceBody}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <Button as="a" href="/auth/login" variant="solid" size="lg" sparkle>
                {pricing.getStarted}
              </Button>
              <Button as="a" href={`${DOCS_URL}installation/`} variant="ghost" size="sm">
                {pricing.installGuide}
              </Button>
            </div>
          </div>
          <div className="grid gap-8 p-8 sm:grid-cols-2">
            <div>
              <p className="mb-4 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.12em] text-green">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-green" />
                {pricing.advantagesTitle}
              </p>
              <ul className="flex flex-col gap-3">
                {pricing.advantages.map((item) => (
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
                {pricing.considerationsTitle}
              </p>
              <ul className="flex flex-col gap-3">
                {pricing.considerations.map((item) => (
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
