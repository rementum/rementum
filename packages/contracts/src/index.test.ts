import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  externalUrlSchema,
  stageWriteSchema,
  updateWorkspaceSchema,
} from "./index.js";

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

describe("updateWorkspaceSchema", () => {
  it("accepts a compaction-only workspace update", () => {
    expect(updateWorkspaceSchema.parse({ llmCompactionEnabled: true })).toEqual({
      llmCompactionEnabled: true,
    });
  });

  it("rejects an empty workspace update", () => {
    expect(() => updateWorkspaceSchema.parse({})).toThrow(/workspace field/i);
  });
});

describe("externalUrlSchema", () => {
  it("accepts browser-navigable links", () => {
    expect(externalUrlSchema.parse("https://example.test/issues/1")).toBe(
      "https://example.test/issues/1",
    );
    expect(externalUrlSchema.parse("http://example.test")).toBe("http://example.test");
  });

  it("rejects script-bearing schemes", () => {
    for (const value of [
      "javascript:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(() => externalUrlSchema.parse(value)).toThrow(/http and https/);
    }
  });

  it("guards task links", () => {
    expect(() =>
      createTaskSchema.parse({
        brainId: "00000000-0000-4000-8000-000000000001",
        title: "Task",
        brief: "Brief",
        links: ["javascript:alert(1)"],
      }),
    ).toThrow(/http and https/);
  });
});
