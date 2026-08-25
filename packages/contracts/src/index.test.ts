import { describe, expect, it } from "vitest";
import { stageWriteSchema } from "./index.js";

describe("stageWriteSchema", () => {
  it("does not publish or retain a caller-authored summary", () => {
    const parsed = stageWriteSchema.parse({
      brainId: "00000000-0000-4000-8000-000000000001",
      operation: "create",
      slug: "architecture",
      title: "Architecture",
      summary: "Caller-authored summary",
      body: "Canonical body",
      changeSummary: "Create architecture memory",
    });
    expect(parsed).not.toHaveProperty("summary");
  });
});
