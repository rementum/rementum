import { describe, expect, it } from "vitest";
import { resolveRequestLocale } from "./middleware";

describe("resolveRequestLocale", () => {
  it("derives the locale from the first path segment", () => {
    expect(resolveRequestLocale("/zh")).toBe("zh");
    expect(resolveRequestLocale("/tr")).toBe("tr");
    expect(resolveRequestLocale("/")).toBe("en");
  });

  it("prefers the route over the cookie", () => {
    expect(resolveRequestLocale("/zh", "tr")).toBe("zh");
  });

  it("falls back to the cookie off the localized routes", () => {
    expect(resolveRequestLocale("/dashboard", "tr")).toBe("tr");
    expect(resolveRequestLocale("/dashboard", "bogus")).toBe("en");
    expect(resolveRequestLocale("/dashboard")).toBe("en");
  });

  it("does not treat a nested path or a deeper segment as a locale", () => {
    expect(resolveRequestLocale("/brains/abc")).toBe("en");
    expect(resolveRequestLocale("/brains/zh")).toBe("en");
  });

  // Next hands the query string to the request separately, so a pathname with one is
  // never a real route; it must fall back rather than half-match a segment.
  it("falls back on a pathname that still carries a query string", () => {
    expect(resolveRequestLocale("/tr?sharedPage=2")).toBe("en");
  });
});
