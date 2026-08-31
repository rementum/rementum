import { describe, expect, it } from "vitest";
import { normalizeArticleSlug, tokenizeWikiLinks } from "./wiki-links.js";

describe("normalizeArticleSlug", () => {
  it("uses the article slug rules", () => {
    expect(normalizeArticleSlug("Müşteri Geliri")).toBe("musteri-geliri");
    expect(normalizeArticleSlug("!!!")).toBe("untitled");
    expect(normalizeArticleSlug("a".repeat(200))).toHaveLength(120);
  });
});

describe("tokenizeWikiLinks", () => {
  it("parses targets, labels, and heading fragments", () => {
    expect(
      tokenizeWikiLinks(
        "See [[System Architecture|the design]], [[glossary#Terms]], and [[plain]].",
      ),
    ).toMatchObject([
      {
        target: "System Architecture",
        targetSlug: "system-architecture",
        heading: null,
        label: "the design",
      },
      { targetSlug: "glossary", heading: "Terms", label: null },
      { targetSlug: "plain", heading: null, label: null },
    ]);
  });

  it("ignores escaped and malformed links", () => {
    expect(tokenizeWikiLinks(String.raw`\[[escaped]] [[#heading]] [[valid]]`)).toMatchObject([
      { targetSlug: "valid" },
    ]);
    expect(tokenizeWikiLinks(String.raw`\\[[active]]`)).toMatchObject([{ targetSlug: "active" }]);
  });
});
