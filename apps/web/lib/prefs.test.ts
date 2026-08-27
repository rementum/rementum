import { describe, expect, it } from "vitest";
import { ARTICLES_SORTS, BRAINS_SORTS, BRAINS_VIEWS, parsePref } from "./prefs";

describe("parsePref", () => {
  it("passes through a value from the closed set", () => {
    expect(parsePref("list", BRAINS_VIEWS, "card")).toBe("list");
    expect(parsePref("articles", BRAINS_SORTS, "updated")).toBe("articles");
    expect(parsePref("title", ARTICLES_SORTS, "updated")).toBe("title");
  });

  it("falls back when the cookie is absent", () => {
    expect(parsePref(undefined, BRAINS_VIEWS, "card")).toBe("card");
  });

  it("falls back on tampered or stale values", () => {
    for (const value of ["__proto__", "card; Secure", "updated_at DESC", "", "CARD"]) {
      expect(parsePref(value, BRAINS_VIEWS, "card")).toBe("card");
      expect(parsePref(value, ARTICLES_SORTS, "updated")).toBe("updated");
    }
  });
});
