import { afterEach, describe, expect, it, vi } from "vitest";
import { bridgeApiPath, bridgeBodyLimit, isSameOriginRequest, siteOrigin } from "./bridge";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteOrigin", () => {
  it("prefers the configured public origin over the request's own", () => {
    vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", "https://rementum.example.test/");
    expect(siteOrigin("http://web:3000/auth/logout")).toBe("https://rementum.example.test");
  });

  it("falls back to the request origin for a host-run dev server", () => {
    vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", undefined);
    expect(siteOrigin("http://localhost:3000/auth/logout")).toBe("http://localhost:3000");
  });
});

describe("isSameOriginRequest", () => {
  const url = "https://rementum.example.test/workspaces/select";

  it("accepts a request that names this site and refuses any other or none", () => {
    vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", "https://rementum.example.test");
    const withOrigin = (origin?: string) =>
      isSameOriginRequest(new Request(url, { method: "POST", headers: origin ? { origin } : {} }));
    expect(withOrigin("https://rementum.example.test")).toBe(true);
    expect(withOrigin("https://attacker.example")).toBe(false);
    expect(withOrigin("null")).toBe(false);
    expect(withOrigin()).toBe(false);
  });
});

describe("bridgeBodyLimit", () => {
  it("allows an archive only on the import routes", () => {
    expect(bridgeBodyLimit(["brains", "brain-id", "imports", "stage"])).toBe(101 * 1024 * 1024);
    expect(bridgeBodyLimit(["brains", "brain-id", "imports", "preview"])).toBe(101 * 1024 * 1024);
    expect(bridgeBodyLimit(["writes"])).toBe(2_500_000);
    expect(bridgeBodyLimit(["brains", "brain-id"])).toBe(2_500_000);
    expect(bridgeBodyLimit(["imports", "brain-id", "imports"])).toBe(2_500_000);
  });
});

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
