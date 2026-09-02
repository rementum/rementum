import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
  headers: async () => new Headers(),
}));

const { POST } = await import("./route");

const site = "https://rementum.example.test";
const token = "session-token";
const fetchMock = vi.fn();

function logoutRequest(origin: string | null = site): Request {
  return new Request(`${site}/auth/logout`, {
    method: "POST",
    headers: origin === null ? {} : { origin },
  });
}

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set("rementum_session", token);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", site);
  vi.stubEnv("REMENTUM_API_INTERNAL_URL", "http://api:8787");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("logout", () => {
  it("revokes the session on the API and clears the cookie", async () => {
    const response = await POST(logoutRequest());
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8787/api/v1/auth/session",
      expect.objectContaining({
        method: "DELETE",
        headers: { cookie: `rementum_session=${token}`, origin: site },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${site}/`);
    expect(response.cookies.get("rementum_session")?.value).toBe("");
  });

  it("still clears the cookie when the API cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const response = await POST(logoutRequest());
    expect(response.status).toBe(303);
    expect(response.cookies.get("rementum_session")?.value).toBe("");
  });

  it("does not call the API without a session cookie", async () => {
    cookieJar.clear();
    const response = await POST(logoutRequest());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
  });

  it("refuses to sign the visitor out for a form posted from another site", async () => {
    for (const origin of ["https://attacker.example", null]) {
      const response = await POST(logoutRequest(origin));
      expect(response.status).toBe(403);
      expect(response.cookies.get("rementum_session")).toBeUndefined();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
