import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { DOCS_URL } from "../../lib/site";
import { IconArrowUpRight } from "../ui/icons";

export function Pricing({ dict, signedIn = false }: { dict: Dictionary; signedIn?: boolean }) {
  const pricing = dict.pricing;
  return (
    <section className="landing-section" id="pricing" tabIndex={-1} aria-labelledby="pricing-title">
      <div className="surface-panel grid gap-10 p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-16">
        <div>
          <h2
            id="pricing-title"
            className="font-medium text-[clamp(28px,3vw,38px)] text-ink leading-tight tracking-tight"
          >
            {pricing.titleA}
            <br />
            {pricing.titleB}
          </h2>
          <div className="mt-8 flex items-baseline gap-3">
            <span className="font-medium text-5xl text-ink tracking-tighter">{pricing.price}</span>
            <span className="text-ink-3 text-sm">{pricing.priceNote}</span>
          </div>
          <a
            href={signedIn ? "/dashboard" : "/auth/login"}
            className="action-link action-link-primary pressable mt-8"
          >
            {signedIn ? dict.common.dashboard : pricing.getStarted} <IconArrowUpRight />
          </a>
        </div>
        <div>
          <p className="max-w-xl text-ink-2 text-lg leading-relaxed">{pricing.intro}</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-medium text-ink">{pricing.included}</h3>
              <p className="mt-3 text-ink-2 text-sm leading-relaxed">{pricing.includedA}</p>
              <p className="mt-3 text-ink-2 text-sm leading-relaxed">{pricing.includedB}</p>
            </div>
            <div>
              <h3 className="font-medium text-ink">{pricing.inYourHands}</h3>
              <p className="mt-3 text-ink-2 text-sm leading-relaxed">{pricing.handsNote}</p>
              <a
                href={`${DOCS_URL}installation/`}
                className="mt-4 inline-flex items-center gap-1.5 font-medium text-accent text-sm hover:underline"
              >
                {pricing.installGuide} <IconArrowUpRight />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
