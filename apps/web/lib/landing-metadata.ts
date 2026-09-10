import type { Metadata } from "next";
import { getDictionary } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { HTML_LANG, LOCALES, OG_LOCALE, SITE_URL_HREF } from "../lib/i18n/locales";
import { SITE_URL } from "../lib/site";

// Per-locale landing metadata. Each locale is its own canonical URL and advertises the
// others through hreflang, so a Turkish query can surface /tr without splitting signals.
export function landingMetadata(locale: Locale): Metadata {
  const meta = getDictionary(locale).meta;
  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: {
      canonical: `${SITE_URL}${SITE_URL_HREF[locale]}`,
      languages: Object.fromEntries(
        LOCALES.map((each) => [HTML_LANG[each], `${SITE_URL}${SITE_URL_HREF[each]}`]),
      ),
    },
    openGraph: {
      locale: OG_LOCALE[locale],
      title: meta.title,
      description: meta.description,
    },
  };
}

// One static render per locale: the public shell stays cacheable and never reads cookies.
export const dynamic = "force-static";
export const revalidate = 60;
