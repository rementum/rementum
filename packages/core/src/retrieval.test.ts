import { describe, expect, it } from "vitest";
import { cosineSimilarity, exactTermScore, reciprocalRankFusion, tokenize } from "./search.js";

describe("reciprocalRankFusion", () => {
  it("ranks an item appearing in several lists above a single first place", () => {
    const fused = reciprocalRankFusion(
      [
        [
          { item: { id: "solo" }, score: 1, source: "fts" as const },
          { item: { id: "both" }, score: 0.5, source: "fts" as const },
        ],
        [{ item: { id: "both" }, score: 0.4, source: "vector" as const }],
      ],
      (item) => item.id,
    );
    expect(fused.map((entry) => entry.item.id)).toEqual(["both", "solo"]);
    expect(fused[0]?.sources).toEqual(["fts", "vector"]);
  });

  it("records a source once even when a list repeats an item", () => {
    const fused = reciprocalRankFusion(
      [
        [
          { item: { id: "a" }, score: 1, source: "fts" as const },
          { item: { id: "a" }, score: 0.9, source: "fts" as const },
        ],
      ],
      (item) => item.id,
    );
    expect(fused).toHaveLength(1);
    expect(fused[0]?.sources).toEqual(["fts"]);
  });

  it("lets a smaller k separate the ranks more sharply", () => {
    const lists = [
      [
        { item: { id: "a" }, score: 1, source: "fts" as const },
        { item: { id: "b" }, score: 1, source: "fts" as const },
      ],
    ];
    const gap = (k: number) => {
      const fused = reciprocalRankFusion(lists, (item) => item.id, k);
      return (fused[0]?.score ?? 0) - (fused[1]?.score ?? 0);
    };
    expect(gap(1)).toBeGreaterThan(gap(60));
  });

  it("returns nothing for no lists", () => {
    expect(reciprocalRankFusion([], (item: { id: string }) => item.id)).toEqual([]);
  });
});

describe("tokenize", () => {
  it("splits on anything that is not a letter or a number and drops single characters", () => {
    expect(tokenize("Rementum: a shared brain, v2 (2026)")).toEqual([
      "rementum",
      "shared",
      "brain",
      "v2",
      "2026",
    ]);
  });

  it("loses the leading letter of a word starting with a dotted capital I", () => {
    // Known limitation: lowercasing leaves a combining dot above, which the split treats as a
    // separator, so "İstanbul" and "istanbul" do not match each other in exact-term scoring.
    expect(tokenize("İSTANBUL")).toEqual(["stanbul"]);
    expect(tokenize("istanbul")).toEqual(["istanbul"]);
  });
});

describe("exactTermScore", () => {
  it("scores the share of query terms present in the value", () => {
    expect(exactTermScore("shared brain", "A shared brain for agents")).toBe(1);
    expect(exactTermScore("shared ledger", "A shared brain for agents")).toBe(0.5);
    expect(exactTermScore("nothing here", "A shared brain")).toBe(0);
  });

  it("scores an unusable query as zero rather than dividing by nothing", () => {
    expect(exactTermScore("", "A shared brain")).toBe(0);
    expect(exactTermScore("- ,", "A shared brain")).toBe(0);
  });
});

describe("cosineSimilarity", () => {
  it("measures direction rather than magnitude", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [4, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it("returns zero for mismatched or empty vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("does not divide by zero for a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
