import { describe, expect, it } from "vitest";
import { createLocalSummary, LocalSummaryGenerator } from "./local-summary.js";

describe("local routing summaries", () => {
  it("creates a compact plain-text summary without an external provider", async () => {
    const generator = new LocalSummaryGenerator();
    await expect(
      generator.generateSummary({
        title: "Architecture",
        body: "# Architecture\n\nKeep `packages/core` portable. See [the design](https://example.test/design).",
      }),
    ).resolves.toBe("Keep packages/core portable. See the design (https://example.test/design).");
  });

  it("keeps the beginning and end of long articles within the routing limit", () => {
    const summary = createLocalSummary({
      title: "Long memory",
      body: `${"start ".repeat(180)}\n\n${"latest ".repeat(80)}`,
    });
    expect(summary.length).toBeLessThanOrEqual(1_000);
    expect(summary).toMatch(/^start /);
    expect(summary).toContain(" … ");
    expect(summary).toMatch(/latest$/);
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
