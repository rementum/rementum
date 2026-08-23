import { describe, expect, it } from "vitest";
import { exactTermScore, reciprocalRankFusion, splitMarkdownByHeading } from "./index.js";

describe("retrieval primitives", () => {
  it("fuses rankings without trusting raw scores across engines", () => {
    const fused = reciprocalRankFusion(
      [
        [
          { item: { id: "a" }, score: 100, source: "fts" as const },
          { item: { id: "b" }, score: 10, source: "fts" as const },
        ],
        [
          { item: { id: "b" }, score: 0.91, source: "vector" as const },
          { item: { id: "a" }, score: 0.9, source: "vector" as const },
        ],
      ],
      (item) => item.id,
    );
    expect(fused.map((entry) => entry.item.id)).toEqual(["a", "b"]);
    expect(fused[0]?.sources).toEqual(["fts", "vector"]);
  });

  it("scores unicode exact terms", () => {
    expect(exactTermScore("müşteri geliri", "Aktif müşteri ve net geliri tanımı")).toBe(1);
  });

  it("splits markdown on semantic headings", () => {
    const sections = splitMarkdownByHeading("Intro\n\n# One\nA\n\n## Two\nB");
    expect(sections.map((section) => section.heading)).toEqual([null, "One", "Two"]);
  });
});
