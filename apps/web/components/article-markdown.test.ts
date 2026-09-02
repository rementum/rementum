import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleMarkdown } from "./article-markdown";

describe("ArticleMarkdown", () => {
  it("renders CommonMark and GitHub-flavored Markdown", () => {
    const body = [
      "## Durable notes",
      "",
      "A **strong** [link](https://example.com) with `inline code`.",
      "",
      "- first",
      "- second",
      "",
      "| State | Owner |",
      "| --- | --- |",
      "| current | agent |",
      "",
      "```ts",
      "const version = 1;",
      "```",
    ].join("\n");

    const html = renderToStaticMarkup(createElement(ArticleMarkdown, { body }));

    expect(html).toContain("<h2>Durable notes</h2>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).toContain("<ul>");
    expect(html).toContain("<table>");
    expect(html).toContain('<code class="language-ts">const version = 1;');
  });

  it("does not render embedded HTML or unsafe links", () => {
    const body = '<script>alert("unsafe")</script>\n\n[unsafe](javascript:alert(1))';

    const html = renderToStaticMarkup(createElement(ArticleMarkdown, { body }));

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});

describe("images", () => {
  it("renders a remote image as a link instead of loading it", () => {
    const html = renderToStaticMarkup(
      createElement(ArticleMarkdown, {
        body: "Diagram: ![the diagram](https://attacker.example/pixel.png)",
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://attacker.example/pixel.png"');
    expect(html).toContain(">the diagram<");
    expect(html).toContain('rel="noreferrer noopener nofollow"');
  });
});
