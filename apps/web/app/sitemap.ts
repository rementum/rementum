import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// Only public, indexable URLs belong here. Every app route sits behind auth and is disallowed in
// robots.ts, and the docs site ships its own sitemap under /docs/sitemap.xml.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/docs/`, lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];
}
