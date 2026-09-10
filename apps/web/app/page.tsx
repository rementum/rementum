import { LandingPage } from "../components/landing-page";
import { landingMetadata } from "../lib/landing-metadata";

// Do NOT add `export const dynamic = "force-static"` here, or to /zh and /tr.
//
// The root layout learns this route's locale from the `x-rementum-locale` header that
// middleware.ts sets, and uses it for <html lang> and for the navigation's language.
// `force-static` makes Next set workStore.forceStatic for the whole render tree, and
// headers() then returns an empty Headers object instead of the request's — silently,
// with no error. The layout would fall through to English, so /zh would serve Chinese
// copy inside lang="en" with an English nav and a language chip reading "English".
// (Next applies the page's segment config to the layout too: see
// create-component-tree.js, "the nested most config wins".)
//
// Instead this route is cached with ISR: rendered on the first request, then reused for
// 60s. The output is still a fully rendered, cacheable, indexable page with its own
// canonical URL and hreflang links — it is just not prerendered at build time.
// apps/web/app/landing-routes.test.ts fails if this export comes back.
export const revalidate = 60;
export const metadata = landingMetadata("en");

export default function Home() {
  return <LandingPage locale="en" />;
}
