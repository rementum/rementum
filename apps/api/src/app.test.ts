import { describe, expect, it } from "vitest";
import { redactRequestUrl, requestId } from "./app.js";

describe("requestId", () => {
  it("keeps a short plain caller-supplied id", () => {
    expect(requestId("trace-42.a_b")).toBe("trace-42.a_b");
  });

  it("mints its own id for anything else", () => {
    for (const header of [undefined, ["a", "b"], "", "x".repeat(65), "has space", "a\nb"]) {
      expect(requestId(header)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("redactRequestUrl", () => {
  it("hides invitation tokens and API keys and leaves everything else alone", () => {
    expect(redactRequestUrl("/api/v1/invitations/abc123?x=1")).toBe(
      "/api/v1/invitations/[redacted]?x=1",
    );
    expect(redactRequestUrl("/api/v1/team-invitations/abc123")).toBe(
      "/api/v1/team-invitations/[redacted]",
    );
    expect(redactRequestUrl("/api/v1/team-invitations/accept")).toBe(
      "/api/v1/team-invitations/[redacted]",
    );
    expect(redactRequestUrl("/api/v1/brains/abc/writes")).toBe("/api/v1/brains/abc/writes");
    expect(redactRequestUrl("/mcp/workspace/w?apiKey=rmk_secret&x=1")).toBe(
      "/mcp/workspace/w?apiKey=[redacted]&x=1",
    );
    expect(redactRequestUrl("/mcp/workspace/w?x=1&apiKey=rmk_secret")).toBe(
      "/mcp/workspace/w?x=1&apiKey=[redacted]",
    );
  });
});
