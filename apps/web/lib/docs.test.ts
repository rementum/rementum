import { describe, expect, it } from "vitest";
import { transformDocMarkdown } from "./docs";

describe("transformDocMarkdown", () => {
  it("rewrites .md links to /docs routes", () => {
    const out = transformDocMarkdown(
      "See the [install guide](installation.md) and [overview](index.md).",
    );
    expect(out).toContain("[install guide](/docs/installation)");
    expect(out).toContain("[overview](/docs)");
  });

  it("strips attr_list annotations and keeps the link", () => {
    const out = transformDocMarkdown(
      "[Read the install guide](installation.md){ .md-button .md-button--primary }",
    );
    expect(out).toBe("[Read the install guide](/docs/installation)");
  });

  it("drops banner images that reference MkDocs-only assets", () => {
    const out = transformDocMarkdown(
      "# Title\n\n![Rementum](assets/rementum-banner.png){ .rementum-banner }\n\nBody.",
    );
    expect(out).not.toContain("rementum-banner");
    expect(out).toContain("# Title");
    expect(out).toContain("Body.");
  });

  it("leaves unknown links and code content alone", () => {
    const src = '[external](https://example.com) and `REMENTUM_ENV={ "a": 1 }`';
    expect(transformDocMarkdown(src)).toBe(src);
  });
});
