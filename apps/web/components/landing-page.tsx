import { publicAuthConfig } from "../lib/api";
import { getDictionary } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { GITHUB_URL, SITE_NAME, SITE_URL } from "../lib/site";
import { ConnectTeaser } from "./landing/connect-teaser";
import { LandingFooter } from "./landing/footer";
import { Hero } from "./landing/hero";
import { HowItWorks } from "./landing/how-it-works";
import { MotionProvider } from "./landing/motion-provider";
import { Pricing } from "./landing/pricing";
import { ScrollProgress } from "./landing/scroll-progress";

// Structured data describes a free, self-hosted developer app and ties the site to its GitHub
// organization. The description is translated; identifiers stay stable across locales.
function structuredData(locale: Locale) {
  const meta = getDictionary(locale).meta;
  return {
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
        description: meta.description,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: locale,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        description: meta.description,
        url: SITE_URL,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Linux, Docker",
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        author: { "@id": `${SITE_URL}/#organization` },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

// One landing body shared by /, /zh, and /tr. Each locale is rendered statically at
// build time, so the public shell stays cacheable and never needs to read cookies.
export async function LandingPage({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const authConfig = await publicAuthConfig();
  return (
    <main className="relative">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, first-party JSON-LD string
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(locale)) }}
      />
      <MotionProvider>
        <ScrollProgress />
        <Hero githubUrl={GITHUB_URL} dict={dict} />
        <HowItWorks dict={dict} />
        <Pricing dict={dict} />
        <ConnectTeaser githubUrl={GITHUB_URL} dict={dict} />
        <LandingFooter
          githubUrl={GITHUB_URL}
          signupEnabled={authConfig.signupEnabled}
          dict={dict}
        />
      </MotionProvider>
    </main>
  );
}
