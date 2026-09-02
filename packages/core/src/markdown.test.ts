import { describe, expect, it } from "vitest";
import { DomainError } from "./errors.js";
import {
  parseMarkdownDocument,
  slugify,
  splitFrontMatter,
  splitMarkdownByHeading,
} from "./markdown.js";

describe("splitMarkdownByHeading", () => {
  it("keeps the heading line with the section it introduces", () => {
    const sections = splitMarkdownByHeading("# One\nA\n\n## Two\nB");
    expect(sections).toEqual([
      { ordinal: 0, heading: "One", level: 1, text: "# One\nA" },
      { ordinal: 1, heading: "Two", level: 2, text: "## Two\nB" },
    ]);
  });

  it("drops sections that hold nothing but whitespace", () => {
    expect(splitMarkdownByHeading("\n\n   \n\n")).toEqual([]);
  });

  it("normalises Windows line endings", () => {
    const sections = splitMarkdownByHeading("# One\r\nA\r\n");
    expect(sections[0]?.text).toBe("# One\nA");
  });

  it("splits an oversized section on paragraph boundaries and keeps its heading", () => {
    const paragraph = "word ".repeat(20).trim();
    const body = Array.from({ length: 12 }, () => paragraph).join("\n\n");
    const sections = splitMarkdownByHeading(`# Long\n${body}`, 200);
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) {
      expect(section.heading).toBe("Long");
      expect(section.text.length).toBeLessThanOrEqual(200);
    }
    expect(sections.map((section) => section.ordinal)).toEqual(
      sections.map((_section, index) => index),
    );
  });

  it("hard splits a single paragraph that is longer than the limit", () => {
    const sections = splitMarkdownByHeading(`# Long\n${"x".repeat(250)}`, 100);
    expect(sections.map((section) => section.text.length)).toEqual([100, 100, 57]);
  });
});

describe("parseMarkdownDocument", () => {
  it("prefers frontmatter over the first heading", () => {
    const parsed = parseMarkdownDocument(
      [
        "---",
        "title: From frontmatter",
        "summary: A stated summary.",
        "---",
        "",
        "# From heading",
        "",
        "Body text.",
      ].join("\n"),
      "Fallback",
    );
    expect(parsed.title).toBe("From frontmatter");
    expect(parsed.summary).toBe("A stated summary.");
    expect(parsed.body).toBe("# From heading\n\nBody text.");
  });

  it("falls back to the first heading, then to the supplied title", () => {
    expect(parseMarkdownDocument("# From heading\n\nBody.", "Fallback").title).toBe("From heading");
    expect(parseMarkdownDocument("Body only.", "Fallback").title).toBe("Fallback");
  });

  it("summarises from the first paragraph that is not a heading", () => {
    const parsed = parseMarkdownDocument("# Title\n\n## Sub\n\nThe first real paragraph.", "F");
    expect(parsed.summary).toBe("The first real paragraph.");
  });

  it("uses the title as the summary when there is no prose", () => {
    expect(parseMarkdownDocument("# Only a heading", "F").summary).toBe("Only a heading");
  });

  it("accepts tags as a list or as a separated string", () => {
    const list = parseMarkdownDocument("---\ntags:\n  - one\n  - 2\n---\n\nBody.", "F");
    expect(list.tags).toEqual(["one"]);
    const inline = parseMarkdownDocument("---\ntags: one, two three\n---\n\nBody.", "F");
    expect(inline.tags).toEqual(["one", "two", "three"]);
    expect(parseMarkdownDocument("Body.", "F").tags).toEqual([]);
  });

  it("collects wiki links without their display text or anchor", () => {
    const parsed = parseMarkdownDocument("See [[architecture|the design]] and [[glossary]].", "F");
    expect(parsed.wikiLinks).toEqual(["architecture", "glossary"]);
  });

  it("keeps only string aliases", () => {
    const parsed = parseMarkdownDocument("---\naliases:\n  - alias\n  - 7\n---\n\nBody.", "F");
    expect(parsed.aliases).toEqual(["alias"]);
  });

  it("never lets the document choose a front matter engine", () => {
    // gray-matter would have evaluated this block as JavaScript in the API process.
    const source = "---js\n{ title: (globalThis.__frontMatterRan = true, 'pwned') }\n---\n\nBody.";
    const parsed = parseMarkdownDocument(source, "Fallback");
    expect((globalThis as { __frontMatterRan?: boolean }).__frontMatterRan).toBeUndefined();
    expect(parsed.title).toBe("Fallback");
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe(source);
  });

  it("rejects front matter that is not valid YAML with a client error", () => {
    expect(() => parseMarkdownDocument("---\ntitle: [unterminated\n---\nBody.", "F")).toThrow(
      DomainError,
    );
    expect(() => parseMarkdownDocument("---\ntitle: [unterminated\n---\nBody.", "F")).toThrow(
      /Front matter is not valid YAML/,
    );
  });

  it("collects a run of opening brackets in linear time", () => {
    const started = performance.now();
    const parsed = parseMarkdownDocument(`# T\n\n${"[".repeat(400_000)}`, "F");
    expect(parsed.wikiLinks).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe("splitFrontMatter", () => {
  it("requires the opening and closing lines to be exactly three dashes", () => {
    expect(splitFrontMatter("---\ntitle: A\n---\nBody")).toEqual({
      data: { title: "A" },
      content: "Body",
    });
    expect(splitFrontMatter("--- yaml\ntitle: A\n---\nBody").data).toEqual({});
    expect(splitFrontMatter("---\ntitle: A\n--- \nBody").data).toEqual({});
  });

  it("accepts Windows line endings and a byte order mark", () => {
    expect(splitFrontMatter("\uFEFF---\r\ntitle: A\r\n---\r\nBody")).toEqual({
      data: { title: "A" },
      content: "Body",
    });
  });

  it("treats an unterminated block as body text", () => {
    expect(splitFrontMatter("---\ntitle: A\nBody")).toEqual({
      data: {},
      content: "---\ntitle: A\nBody",
    });
  });

  it("ignores front matter that is not a mapping", () => {
    expect(splitFrontMatter("---\n- one\n- two\n---\nBody")).toEqual({ data: {}, content: "Body" });
    expect(splitFrontMatter("---\njust a string\n---\nBody").data).toEqual({});
  });

  it("closes the block at the end of the document", () => {
    expect(splitFrontMatter("---\ntitle: A\n---")).toEqual({ data: { title: "A" }, content: "" });
  });
});

describe("slugify", () => {
  it("strips diacritics and punctuation", () => {
    expect(slugify("Müşteri Geliri")).toBe("musteri-geliri");
    expect(slugify("  Spaces & Symbols!  ")).toBe("spaces-symbols");
  });

  it("replaces a letter with no ASCII decomposition rather than dropping it", () => {
    // Known limitation: dotless i has no combining-mark decomposition, so it becomes a
    // separator instead of "i". Slugs stay unique, but they read badly in Turkish.
    expect(slugify("Tanımı")).toBe("tan-m");
  });

  it("caps the length and never returns an empty slug", () => {
    expect(slugify("a".repeat(200))).toHaveLength(120);
    expect(slugify("!!!")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });
});
