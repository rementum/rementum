import { describe, expect, it } from "vitest";
import { createLocalSummary, LocalArticleGenerator } from "./local-summary.js";

describe("local routing summaries", () => {
  it("creates a compact plain-text summary without an external provider", async () => {
    const generator = new LocalArticleGenerator();
    const input = {
      title: "Architecture",
      body: "# Architecture\n\nKeep `packages/core` portable. See [the design](https://example.test/design).",
    };
    await expect(generator.generateArticle(input)).resolves.toEqual({
      ...input,
      summary: "Keep packages/core portable.",
    });
  });

  it("keeps a long first sentence within the routing limit", () => {
    const summary = createLocalSummary({
      title: "Long memory",
      body: `${"start ".repeat(180)}\n\n${"latest ".repeat(80)}`,
    });
    expect(summary.length).toBeLessThanOrEqual(300);
    expect(summary).toMatch(/^start /);
    expect(summary).toMatch(/…$/);
    expect(summary).not.toContain("latest");
  });

  it("uses only the first sentence for the local routing summary", () => {
    expect(
      createLocalSummary({
        title: "Config",
        body: "Use local summaries by default. Enable an LLM only when compaction is wanted.",
      }),
    ).toBe("Use local summaries by default.");
  });

  it("summarises hostile bodies in linear time", () => {
    const bodies = [
      "<".repeat(600_000),
      "![".repeat(300_000),
      "[".repeat(600_000),
      `# a${" ".repeat(600_000)}b`,
      `[[${"|".repeat(300_000)}`,
    ];
    for (const body of bodies) {
      const started = performance.now();
      const summary = createLocalSummary({ title: "a", body });
      expect(summary.length).toBeLessThanOrEqual(300);
      expect(performance.now() - started).toBeLessThan(2_000);
    }
  });

  it("falls back to the title when the body has no prose", () => {
    expect(createLocalSummary({ title: "Only title", body: "# Only title" })).toBe("Only title");
  });

  it("ignores front matter and preserves technical identifiers", () => {
    expect(
      createLocalSummary({
        title: "Config",
        body: "---\ntags: [runtime]\n---\n\nUse `REMENTUM_LLM_ENABLED=false` with `src/**/*.ts`.",
      }),
    ).toBe("Use REMENTUM_LLM_ENABLED=false with src/**/*.ts.");
  });

  it("is deterministic", () => {
    const input = { title: "Karar", body: "# Karar\n\nLLM kullanımı isteğe bağlıdır." };
    expect(createLocalSummary(input)).toBe(createLocalSummary(input));
  });
});
