import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocalizedRoutePath,
  LOCALES,
  localeFromAcceptLanguage,
  parseLocale,
  resolveLayoutLocale,
  resolveLocale,
} from "./locales";

describe("parseLocale", () => {
  it("passes through the supported locales", () => {
    for (const locale of LOCALES) {
      expect(parseLocale(locale)).toBe(locale);
    }
  });

  it("falls back to English when the cookie is absent", () => {
    expect(parseLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it("falls back on tampered or stale values", () => {
    for (const value of ["__proto__", "en; Secure", "zh-CN", "EN", "", "de"]) {
      expect(parseLocale(value)).toBe(DEFAULT_LOCALE);
    }
  });
});

describe("localeFromAcceptLanguage", () => {
  it("returns English for empty headers", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage(undefined)).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
  });

  it("matches primary subtags with regions", () => {
    expect(localeFromAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(localeFromAcceptLanguage("tr-TR,tr;q=0.9")).toBe("tr");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
  });

  it("respects quality order", () => {
    expect(localeFromAcceptLanguage("en;q=0.5,tr;q=0.9")).toBe("tr");
    expect(localeFromAcceptLanguage("de,fr;q=0.9")).toBe("en");
  });

  it("treats wildcard as English", () => {
    expect(localeFromAcceptLanguage("*")).toBe("en");
  });
});

describe("resolveLocale", () => {
  it("prefers an explicit cookie over the header", () => {
    expect(resolveLocale("tr", "zh-CN")).toBe("tr");
  });

  it("falls back to English on a tampered cookie even with a matching header", () => {
    expect(resolveLocale("de", "tr")).toBe("en");
  });

  it("negotiates from the header when no cookie exists", () => {
    expect(resolveLocale(undefined, "zh-TW")).toBe("zh");
  });
});

// This is the function the root layout uses for <html lang> and the navigation's language.
// The header arg is what middleware publishes for /zh and /tr.
describe("resolveLayoutLocale", () => {
  it("takes the route locale even when the visitor has no cookie", () => {
    // Regression: with the landing routes force-statically prerendered, headers() came
    // back empty here and /zh rendered lang="en" with an English navigation.
    expect(resolveLayoutLocale("zh", undefined, undefined)).toBe("zh");
    expect(resolveLayoutLocale("tr", undefined, undefined)).toBe("tr");
  });

  it("lets the route beat a contradictory cookie", () => {
    expect(resolveLayoutLocale("zh", "tr", "en-US")).toBe("zh");
    expect(resolveLayoutLocale("tr", "en", "zh-CN")).toBe("tr");
  });

  it("falls back to the cookie, then Accept-Language, off the localized routes", () => {
    expect(resolveLayoutLocale("en", "tr", "zh-CN")).toBe("tr");
    expect(resolveLayoutLocale("en", undefined, "zh-CN")).toBe("zh");
    expect(resolveLayoutLocale(null, undefined, "tr-TR")).toBe("tr");
    expect(resolveLayoutLocale(undefined, undefined, undefined)).toBe("en");
  });

  it("does not let a tampered header or cookie through", () => {
    // A junk header is not a locale, so it falls through to the cookie...
    expect(resolveLayoutLocale("de", undefined, "tr")).toBe("tr");
    // ...but a present-but-invalid cookie is treated as an explicit English choice, the
    // same rule resolveLocale already applies, rather than silently negotiating.
    expect(resolveLayoutLocale("de", "bogus", "tr")).toBe("en");
  });
});

describe("isLocalizedRoutePath", () => {
  it("is true only on the routes that exist per locale", () => {
    for (const path of ["/", "/zh", "/tr", "/zh/"]) {
      expect(isLocalizedRoutePath(path), path).toBe(true);
    }
    for (const path of ["/dashboard", "/activity", "/auth/login", "/brains/zh", "/zh/extra"]) {
      expect(isLocalizedRoutePath(path), path).toBe(false);
    }
  });

  it("is false for a missing pathname", () => {
    expect(isLocalizedRoutePath(null)).toBe(false);
    expect(isLocalizedRoutePath(undefined)).toBe(false);
  });

  // Guards the switcher bug where /dashboard sent the visitor to the marketing homepage.
  it("does not claim the app routes are localized", () => {
    for (const locale of LOCALES) {
      const href = `/dashboard${locale === "en" ? "" : `?locale=${locale}`}`;
      expect(isLocalizedRoutePath(href)).toBe(false);
    }
  });
});
