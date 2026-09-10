import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  localeFromAcceptLanguage,
  parseLocale,
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
