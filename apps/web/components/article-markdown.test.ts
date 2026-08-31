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

    expect(html).toContain('<h2 id="durable-notes">Durable notes</h2>');
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

  it("renders resolved wiki links, heading fragments, and unresolved targets", () => {
    const body = [
      "See [[Architecture#Key Decisions|the design]] and [[Missing Note]].",
      "",
      "Keep \\[[escaped]] and `[[inline-code]]` literal.",
      "",
      "```md",
      "[[fenced-code]]",
      "```",
    ].join("\n");
    const html = renderToStaticMarkup(
      createElement(ArticleMarkdown, {
        body,
        links: [
          {
            articleId: "00000000-0000-4000-8000-000000000001",
            slug: "architecture",
            title: "Architecture",
            targetSlug: "architecture",
            relation: "wiki",
            origin: "wiki",
          },
        ],
      }),
    );

    expect(html).toContain('href="/articles/00000000-0000-4000-8000-000000000001#key-decisions"');
    expect(html).toContain('class="wiki-link wiki-link-unresolved"');
    expect(html).toContain("[[escaped]]");
    expect(html).toContain("[[inline-code]]");
    expect(html).toContain("[[fenced-code]]");
  });
});
