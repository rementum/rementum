// A conflicted staged write cannot be promoted normally: promoteStagedWrite flips it back to
// conflicted unless the decision is "override", which replaces current canon and discards the
// change that caused the conflict. A pending write promotes normally. Keeping this mapping in a
// plain module lets the review UI stay a thin client and lets the choice be tested without a DOM.
export type PromoteDecision = "promote" | "override";

export interface PromoteRequest {
  decision: PromoteDecision;
  decisionSummary: string;
}

export function promoteRequestFor(status: string): PromoteRequest {
  return status === "conflicted"
    ? { decision: "override", decisionSummary: "Overridden in Rementum web" }
    : { decision: "promote", decisionSummary: "Approved in Rementum web" };
}

// Only these two states can still be acted on; promoted and withdrawn writes are terminal.
export function isReviewable(status: string): boolean {
  return status === "pending" || status === "conflicted";
}
