import { describe, expect, it } from "vitest";
import { isReviewable, promoteRequestFor } from "./promote-decision";

describe("promoteRequestFor", () => {
  it("promotes a pending write normally", () => {
    expect(promoteRequestFor("pending")).toEqual({
      decision: "promote",
      decisionSummary: "Approved in Rementum web",
    });
  });

  it("overrides a conflicted write so the button can advance it", () => {
    expect(promoteRequestFor("conflicted")).toEqual({
      decision: "override",
      decisionSummary: "Overridden in Rementum web",
    });
  });
});

describe("isReviewable", () => {
  it("allows action only on pending and conflicted writes", () => {
    expect(isReviewable("pending")).toBe(true);
    expect(isReviewable("conflicted")).toBe(true);
    expect(isReviewable("promoted")).toBe(false);
    expect(isReviewable("withdrawn")).toBe(false);
  });
});
