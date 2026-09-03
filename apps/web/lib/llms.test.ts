import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cleanMarkdown, getLlmsFullTxt, getLlmsTxt, PAGES } from "./llms";
import { SITE_URL } from "./site";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("cleanMarkdown", () => {
  it("drops local assets images", () => {
    const input = "Before\n![Logo](assets/logo.png)\nAfter";
    expect(cleanMarkdown(input)).toBe("Before\nAfter\n");
  });

  it("converts MkDocs admonitions to bold notes", () => {
    const input = '!!! warning "Important Notice"\n    This is a warning message.\n\nNext line';
    const cleaned = cleanMarkdown(input);
    expect(cleaned).toContain("**Important Notice**");
    expect(cleaned).toContain("This is a warning message.");
  });

  it("keeps the type of an untitled admonition", () => {
    expect(cleanMarkdown("!!! danger\n    Do not do this.")).toBe("**Danger**\nDo not do this.\n");
  });

  it("strips attribute lists like buttons and classes", () => {
    const input = "[Install](install.md){ .md-button .md-button--primary }";
    expect(cleanMarkdown(input)).toBe("[Install](install.md)\n");
  });

  it("leaves fenced code and mid-line braces alone", () => {
    const input = "```ts\nconst next = { ...page, cleaned };\n```\nSet { #private } stays";
    expect(cleanMarkdown(input)).toBe(`${input}\n`);
  });
});

describe("PAGES", () => {
  it("lists the MkDocs nav pages with the same titles and order", () => {
    const mkdocs = readFileSync(resolve(repoRoot, "mkdocs.yml"), "utf8");
    const nav = mkdocs.slice(mkdocs.indexOf("\nnav:\n")).split("\n\n")[0] ?? "";
    const entries = [...nav.matchAll(/^\s+- ([^:\n]+): (\S+\.md)$/gm)].map(
      (m) => `${m[1]}: ${m[2]}`,
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(PAGES.map((p) => `${p.title}: ${p.file}`)).toEqual(entries);
  });
});

describe("getLlmsTxt", () => {
  it("indexes every page with its blurb and links to the full text", () => {
    const content = getLlmsTxt();
    expect(content.startsWith("# Rementum\n")).toBe(true);
    expect(content).toContain("## Documentation");
    for (const page of PAGES) {
      expect(content).toContain(`- [${page.title}](${SITE_URL}/docs${page.path}): ${page.blurb}`);
    }
    expect(content).toContain("## Source\n\n- [GitHub repository](");
    expect(content).toContain(`${SITE_URL}/llms-full.txt`);
  });
});

describe("getLlmsFullTxt", () => {
  it("inlines one cleaned section per page", () => {
    const content = getLlmsFullTxt();
    expect(content.startsWith("# Rementum documentation\n")).toBe(true);
    expect(content).toContain(`Source: ${SITE_URL} · Repository:`);
    const sections = content.split("\n---\n\nSource: ").slice(1);
    expect(sections.map((s) => s.split("\n")[0])).toEqual(
      PAGES.map((page) => `${SITE_URL}/docs${page.path}`),
    );
    for (const section of sections) {
      expect(section.trim().split("\n").length).toBeGreaterThan(2);
    }
    expect(content).not.toMatch(/\{\s*\.md-button/);
  });
});
