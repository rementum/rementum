import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const { POST } = await import("./route");

const site = "https://rementum.example.test";
const token = "session-token";
const fetchMock = vi.fn();

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
    const response = await POST();
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
    const response = await POST();
    expect(response.status).toBe(303);
    expect(response.cookies.get("rementum_session")?.value).toBe("");
  });

  it("does not call the API without a session cookie", async () => {
    cookieJar.clear();
    const response = await POST();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
  });
});
