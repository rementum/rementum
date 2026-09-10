import { describe, expect, it } from "vitest";
import { parseSurface, surfaceForPath } from "./surface";

describe("surfaceForPath", () => {
  it("marks the marketing routes as the public shell", () => {
    for (const path of ["/", "/zh", "/tr", "/zh/"]) {
      expect(surfaceForPath(path), path).toBe("landing");
    }
  });

  it("keeps every other route in the app shell", () => {
    for (const path of ["/dashboard", "/activity", "/brains/zh", "/zh/extra", "/auth/login"]) {
      expect(surfaceForPath(path), path).toBe("app");
    }
  });
});

describe("parseSurface", () => {
  it("reads the header middleware set", () => {
    expect(parseSurface("landing")).toBe("landing");
    expect(parseSurface("app")).toBe("app");
  });

  // The fallback is the app: a missing or tampered header must never strip the sidebar off
  // a signed-in page, and the marketing routes always arrive with the header set.
  it("falls back to the app shell on anything unexpected", () => {
    for (const value of [null, undefined, "", "LANDING", "marketing"]) {
      expect(parseSurface(value), String(value)).toBe("app");
    }
  });
});
