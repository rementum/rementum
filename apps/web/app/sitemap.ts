import type { MetadataRoute } from "next";
import { LOCALES, SITE_URL_HREF } from "../lib/i18n/locales";
import { SITE_URL } from "../lib/site";

// Only public, indexable URLs belong here. Every app route sits behind auth and is disallowed in
// robots.ts, and the docs site ships its own sitemap under /docs/sitemap.xml.
// The landing page exists once per locale at /, /zh, and /tr; each is its own canonical URL.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    ...LOCALES.map((locale) => ({
      url: `${SITE_URL}${SITE_URL_HREF[locale]}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: locale === "en" ? 1 : 0.9,
    })),
    { url: `${SITE_URL}/docs/`, lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];
}
