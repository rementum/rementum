import type { Metadata } from "next";
import { getDictionary } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { HTML_LANG, LOCALES, OG_LOCALE, SITE_URL_HREF } from "../lib/i18n/locales";
import { SITE_URL } from "../lib/site";

// Per-locale landing metadata. Each locale is its own canonical URL and advertises the
// others through hreflang, so a Turkish query can surface /tr without splitting signals.
//
// Segment config (`dynamic`, `revalidate`) deliberately does not live here: Next only
// reads those exports from a route file, so on a shared module they are inert and read
// as if they did something. Each landing route declares its own.
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
    // The root layout sets English twitter tags; without these a shared /zh link would
    // preview in English while og: already previewed in Chinese. Next replaces the whole
    // twitter object rather than merging it, so the card has to be repeated here or it
    // silently falls back to "summary".
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
    },
  };
}
