import { describe, expect, it } from "vitest";
import { bridgeApiPath } from "./bridge";

describe("bridgeApiPath", () => {
  it("keeps ordinary API paths", () => {
    expect(bridgeApiPath(["writes", "abc", "promote"])).toBe("/api/v1/writes/abc/promote");
  });

  it("re-encodes segments so they cannot add path structure", () => {
    expect(bridgeApiPath(["connections", "grant/../../oauth/token"])).toBe(
      "/api/v1/connections/grant%2F..%2F..%2Foauth%2Ftoken",
    );
  });

  it("rejects traversal and empty segments", () => {
    expect(bridgeApiPath([])).toBeNull();
    expect(bridgeApiPath([""])).toBeNull();
    expect(bridgeApiPath(["..", "..", "oauth", "token"])).toBeNull();
    expect(bridgeApiPath(["writes", ".", "promote"])).toBeNull();
  });
});
