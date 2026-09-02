import { describe, expect, it } from "vitest";
import { cleanMarkdown, getLlmsFullTxt, getLlmsTxt } from "./llms";

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

  it("strips attribute lists like buttons and classes", () => {
    const input = "[Install](install.md){ .md-button .md-button--primary }";
    expect(cleanMarkdown(input)).toBe("[Install](install.md)\n");
  });
});

describe("getLlmsTxt", () => {
  it("generates an llmstxt index with summary and doc links", () => {
    const content = getLlmsTxt();
    expect(content).toContain("# Rementum");
    expect(content).toContain("## Documentation");
    expect(content).toContain("## Source");
    expect(content).toContain("- [Overview](");
    expect(content).toContain("- [Install](");
    expect(content).toContain("/llms-full.txt");
  });
});

describe("getLlmsFullTxt", () => {
  it("inlines documentation pages with delimiters", () => {
    const content = getLlmsFullTxt();
    expect(content).toContain("# Rementum documentation");
    expect(content).toContain("Source: https://rementum.dev");
    expect(content).toContain("---");
    expect(content).toContain("# One shared memory for your agents");
  });
});
