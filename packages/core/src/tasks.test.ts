import { describe, expect, it } from "vitest";
import { canTransitionTask } from "./tasks.js";

describe("canTransitionTask", () => {
  it("lets a task keep its status and move along the review flow", () => {
    expect(canTransitionTask("open", "open")).toBe(true);
    expect(canTransitionTask("claimed", "review")).toBe(true);
    expect(canTransitionTask("review", "approved")).toBe(true);
    expect(canTransitionTask("approved", "completed")).toBe(true);
    expect(canTransitionTask("blocked", "open")).toBe(true);
  });

  it("refuses approval without review, claiming by update, and edits to finished tasks", () => {
    expect(canTransitionTask("open", "approved")).toBe(false);
    expect(canTransitionTask("claimed", "approved")).toBe(false);
    expect(canTransitionTask("open", "claimed")).toBe(false);
    expect(canTransitionTask("completed", "review")).toBe(false);
    expect(canTransitionTask("cancelled", "completed")).toBe(false);
  });

  it("allows a finished task to be reopened", () => {
    expect(canTransitionTask("completed", "open")).toBe(true);
    expect(canTransitionTask("cancelled", "open")).toBe(true);
  });
});
