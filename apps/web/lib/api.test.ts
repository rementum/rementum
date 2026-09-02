import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();

const incomingHeaders = new Headers();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
  headers: async () => incomingHeaders,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { api, hasSession, publicAuthConfig, requireInstanceOwner, sessionInfo, workspaceContext } =
  await import("./api");

const token = "session-token";
const fetchMock = vi.fn();

function respond(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  cookieJar.clear();
  for (const key of [...incomingHeaders.keys()]) incomingHeaders.delete(key);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("REMENTUM_API_INTERNAL_URL", "http://api:8787/");
  vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", "https://rementum.example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hasSession", () => {
  it("does not call the API without a session cookie", async () => {
    await expect(hasSession()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the API verdict for a session cookie", async () => {
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(200, { authenticated: true }));
    await expect(hasSession()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8787/api/v1/auth/session",
      expect.objectContaining({ headers: { cookie: `rementum_session=${token}` } }),
    );

    fetchMock.mockResolvedValueOnce(respond(401, { error: "unauthorized" }));
    await expect(hasSession()).resolves.toBe(false);
  });

  it("treats an unreachable API as signed out", async () => {
    cookieJar.set("rementum_session", token);
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(hasSession()).resolves.toBe(false);
  });
});

describe("api", () => {
  it("sends the browser session to the internal API and returns the payload", async () => {
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(200, [{ id: "team-id" }]));
    await expect(api("/api/v1/teams")).resolves.toEqual([{ id: "team-id" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8787/api/v1/teams",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("falls back to the public API URL when no internal URL is set", async () => {
    vi.stubEnv("REMENTUM_API_INTERNAL_URL", undefined);
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(200, []));
    await api("/api/v1/teams");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://rementum.example.test/api/v1/teams",
      expect.anything(),
    );
  });

  it("redirects to the login page without a session and on a rejected one", async () => {
    await expect(api("/api/v1/teams")).rejects.toThrow("REDIRECT:/auth/login");
    expect(fetchMock).not.toHaveBeenCalled();

    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(401, { error: "unauthorized" }));
    await expect(api("/api/v1/teams")).rejects.toThrow("REDIRECT:/auth/login");
  });

  it("forwards the client address chain the edge proxy recorded", async () => {
    cookieJar.set("rementum_session", token);
    incomingHeaders.set("x-forwarded-for", "203.0.113.7");
    fetchMock.mockResolvedValueOnce(respond(200, []));
    await api("/api/v1/teams");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8787/api/v1/teams",
      expect.objectContaining({
        headers: { cookie: `rementum_session=${token}`, "x-forwarded-for": "203.0.113.7" },
      }),
    );
  });

  it("renders the not-found page for a resource the API cannot find", async () => {
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(404, { code: "not_found" }));
    await expect(api("/api/v1/articles/missing")).rejects.toThrow("NOT_FOUND");
  });

  it("surfaces any other API failure with its status and body", async () => {
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(503, "dependency_unavailable"));
    await expect(api("/api/v1/teams")).rejects.toThrow(
      /Rementum API returned 503: dependency_unavailable/,
    );
  });
});

describe("workspaceContext", () => {
  const teams = [
    { id: "team-a", slug: "a", name: "A", role: "owner", createdAt: "" },
    { id: "team-b", slug: "b", name: "B", role: "member", createdAt: "" },
  ];
  const workspaces = [
    { id: "workspace-a", teamId: "team-a", slug: "wa", name: "WA" },
    { id: "workspace-b", teamId: "team-b", slug: "wb", name: "WB" },
  ];

  function serveContext() {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/api/v1/teams") ? respond(200, teams) : respond(200, workspaces),
    );
  }

  it("defaults to the first workspace and its team", async () => {
    cookieJar.set("rementum_session", token);
    serveContext();
    const context = await workspaceContext();
    expect(context.activeWorkspace?.id).toBe("workspace-a");
    expect(context.activeTeam?.id).toBe("team-a");
    expect(context.workspaces).toHaveLength(2);
  });

  it("honours the selected workspace cookie", async () => {
    cookieJar.set("rementum_session", token);
    cookieJar.set("rementum_workspace", "workspace-b");
    serveContext();
    const context = await workspaceContext();
    expect(context.activeWorkspace?.id).toBe("workspace-b");
    expect(context.activeTeam?.id).toBe("team-b");
  });

  it("falls back to the first workspace when the cookie names an unreachable one", async () => {
    cookieJar.set("rementum_session", token);
    cookieJar.set("rementum_workspace", "workspace-from-another-account");
    serveContext();
    await expect(workspaceContext()).resolves.toMatchObject({
      activeWorkspace: { id: "workspace-a" },
    });
  });
});

describe("publicAuthConfig", () => {
  it("reads the signup flag and the turnstile site key without a session", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, { signupEnabled: true, turnstileSiteKey: "0x4AAAAAAA-site" }),
    );
    await expect(publicAuthConfig()).resolves.toEqual({
      signupEnabled: true,
      turnstileSiteKey: "0x4AAAAAAA-site",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://api:8787/api/v1/auth/config", {
      next: { revalidate: 60 },
    });
  });

  it("treats a missing site key as bot protection being off", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { signupEnabled: true }));
    await expect(publicAuthConfig()).resolves.toEqual({
      signupEnabled: true,
      turnstileSiteKey: null,
    });
  });

  it("closes signup and bot protection when the API cannot be reached or refuses", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(publicAuthConfig()).resolves.toEqual({
      signupEnabled: false,
      turnstileSiteKey: null,
    });
    fetchMock.mockResolvedValueOnce(respond(500, "internal"));
    await expect(publicAuthConfig()).resolves.toEqual({
      signupEnabled: false,
      turnstileSiteKey: null,
    });
  });
});

describe("sessionInfo", () => {
  it("reports the owner flag the API attaches to the session", async () => {
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(200, { authenticated: true, systemOwner: true }));
    await expect(sessionInfo()).resolves.toEqual({ authenticated: true, systemOwner: true });
    // An API that predates the flag still signs the visitor in, as an ordinary member.
    fetchMock.mockResolvedValueOnce(respond(200, { authenticated: true }));
    await expect(sessionInfo()).resolves.toEqual({ authenticated: true, systemOwner: false });
  });

  it("is signed out without a cookie, on a rejected session, and when the API is down", async () => {
    await expect(sessionInfo()).resolves.toEqual({ authenticated: false, systemOwner: false });
    expect(fetchMock).not.toHaveBeenCalled();
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(401, { error: "unauthorized" }));
    await expect(sessionInfo()).resolves.toEqual({ authenticated: false, systemOwner: false });
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(sessionInfo()).resolves.toEqual({ authenticated: false, systemOwner: false });
  });
});

describe("requireInstanceOwner", () => {
  it("sends a visitor to sign in, hides the panel from members, and admits the owner", async () => {
    await expect(requireInstanceOwner()).rejects.toThrow("REDIRECT:/auth/login");
    cookieJar.set("rementum_session", token);
    fetchMock.mockResolvedValueOnce(respond(200, { authenticated: true, systemOwner: false }));
    await expect(requireInstanceOwner()).rejects.toThrow("NOT_FOUND");
    fetchMock.mockResolvedValueOnce(respond(200, { authenticated: true, systemOwner: true }));
    await expect(requireInstanceOwner()).resolves.toBeUndefined();
  });
});
