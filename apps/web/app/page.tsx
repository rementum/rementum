import type { Metadata } from "next";
import { Architecture } from "../components/landing/architecture";
import { CapabilityMarquee } from "../components/landing/capability-marquee";
import { ConnectTeaser } from "../components/landing/connect-teaser";
import { CTASection } from "../components/landing/cta";
import { FeatureGrid } from "../components/landing/feature-grid";
import { LandingFooter } from "../components/landing/footer";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { MotionProvider } from "../components/landing/motion-provider";
import { Pricing } from "../components/landing/pricing";
import { ScrollProgress } from "../components/landing/scroll-progress";
import { SectionHead } from "../components/landing/section-head";
import { Stepper } from "../components/landing/stepper";
import { GradientText } from "../components/pui";
import { publicAuthConfig } from "../lib/api";
import { GITHUB_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/site";

// This route deliberately sees empty cookies, including in the parent layout, so Next can serve
// one cached public landing page. Session-dependent rendering lives at /dashboard.
export const dynamic = "force-static";
export const revalidate = 60;

// The landing page is the one indexable, canonical URL; every private route stays out of robots.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Structured data lets search engines describe Rementum as a free, self-hosted developer app and
// tie the site to its GitHub organization. Kept in sync with the marketing copy and the license.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux, Docker",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      author: { "@id": `${SITE_URL}/#organization` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

export default async function Home() {
  const authConfig = await publicAuthConfig();
  return (
    <main className="relative">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, first-party JSON-LD string
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <MotionProvider>
        <ScrollProgress />
        <Hero githubUrl={GITHUB_URL} />
        <HowItWorks />
        <CapabilityMarquee />
        <WorkflowLanding />
        <FeatureGrid />
        <Architecture />
        <Pricing />
        <ConnectTeaser />
        <CTASection githubUrl={GITHUB_URL} />
        <LandingFooter githubUrl={GITHUB_URL} signupEnabled={authConfig.signupEnabled} />
      </MotionProvider>
    </main>
  );
}

function WorkflowLanding() {
  const steps = [
    {
      code: "route",
      title: "Find the right article.",
      body: "Agents read a compact index of titles, summaries, keywords, and freshness to choose one article.",
    },
    {
      code: "read",
      title: "Load current canon.",
      body: "Agents open the full article only after the index identifies it. The rest of the brain stays untouched.",
    },
    {
      code: "stage",
      title: "Analyze and stage the memory.",
      body: "Rementum stages the submitted knowledge as written; an opted-in workspace compacts the promoted title, summary, and body in the background.",
    },
    {
      code: "promote",
      title: "Keep the history.",
      body: "Rementum creates an immutable version and records an audit event when a write is promoted.",
    },
  ];

  return (
    <section
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20"
      id="workflow"
      tabIndex={-1}
    >
      <SectionHead
        kicker="The write path"
        title={
          <>
            Load the right <GradientText>context</GradientText>.
          </>
        }
      >
        Agents read a compact index and open one article. Rementum stages each change before it
        lands.
      </SectionHead>
      <Stepper steps={steps} />
    </section>
  );
}
