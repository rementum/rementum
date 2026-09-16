import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { PromoPlayer } from "./promo-player";
import { SectionHead } from "./section-head";

export function HowItWorks({ dict }: { dict: Dictionary }) {
  const section = dict.howItWorks;
  return (
    <section className="landing-section" id="how-it-works">
      <SectionHead title={section.title}>{section.subtitle}</SectionHead>
      <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {section.steps.map((step, index) => (
          <li
            key={step.title}
            className="grid grid-cols-[32px_1fr] gap-x-4 sm:block sm:border-line sm:border-t sm:pt-5"
          >
            <span className="inline-grid size-8 place-items-center rounded-control bg-accent-tint font-mono text-accent text-xs">
              0{index + 1}
            </span>
            <div>
              <h3 className="font-medium text-ink text-xl tracking-tight sm:mt-5">{step.title}</h3>
              <p className="mt-1 text-accent text-xs">{step.note}</p>
              <p className="mt-4 text-ink-2 text-sm leading-relaxed">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <PromoPlayer dict={dict} />
    </section>
  );
}
