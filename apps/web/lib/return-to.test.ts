import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

describe("safeReturnTo", () => {
  it("keeps local paths including their query and fragment", () => {
    expect(safeReturnTo("/team-invite/token?step=1#accept")).toBe(
      "/team-invite/token?step=1#accept",
    );
  });

  it("rejects absolute, protocol-relative, and backslash-normalized origins", () => {
    expect(safeReturnTo("https://evil.example")).toBe("/dashboard");
    expect(safeReturnTo("//evil.example")).toBe("/dashboard");
    expect(safeReturnTo("/\\\\evil.example")).toBe("/dashboard");
  });

  it("rejects paths whose dot segments collapse into another host", () => {
    expect(safeReturnTo("/..//evil.example")).toBe("/dashboard");
    expect(safeReturnTo("/.//evil.example/login")).toBe("/dashboard");
    expect(safeReturnTo("/x/..//evil.example/phish")).toBe("/dashboard");
    expect(safeReturnTo("/..\\\\evil.example")).toBe("/dashboard");
  });

  it("still allows dot segments that stay on this site", () => {
    expect(safeReturnTo("/brains/../dashboard?tab=1")).toBe("/dashboard?tab=1");
  });

  it("defaults sign-in to the dashboard", () => {
    expect(safeReturnTo(undefined)).toBe("/dashboard");
  });
});
