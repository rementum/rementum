import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCALES, SITE_URL_HREF } from "../lib/i18n/locales";

// The landing routes must not be force-statically prerendered.
//
// `force-static` is read from the page and applied to the whole render tree, after which
// headers() in the root layout returns an empty object instead of the request's. The layout
// takes this route's locale from the x-rementum-locale header that middleware.ts sets, so
// forcing a landing route static silently serves /zh with lang="en" and an English
// navigation: the route still prerenders, the build still exits 0, and every other test
// still passes. This file is the guard, because nothing else can see that failure.
const appDir = fileURLToPath(new URL(".", import.meta.url));

// The routes deliberately *mention* the forbidden export in a comment explaining why it must
// not come back, so the check has to look at code only.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const ROUTES = LOCALES.map((locale) => ({
  locale,
  // "/" -> app/page.tsx, "/zh" -> app/zh/page.tsx
  path: join(appDir, SITE_URL_HREF[locale].replace(/^\//, ""), "page.tsx"),
}));

describe("landing routes", () => {
  for (const { locale, path } of ROUTES) {
    it(`${locale} is not force-static, so the layout can read its locale header`, () => {
      const source = stripComments(readFileSync(path, "utf8"));
      expect(source).not.toMatch(/export\s+const\s+dynamic\s*=\s*["']force-static["']/);
      // ISR keeps the page cacheable and indexable without freezing it at build time.
      expect(source).toMatch(/export\s+const\s+revalidate\s*=\s*\d+/);
    });

    it(`${locale} declares its own metadata and renders its own locale`, () => {
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/export\s+const\s+metadata\s*=\s*landingMetadata\(/);
      expect(source).toContain(`locale="${locale}"`);
    });
  }
});
