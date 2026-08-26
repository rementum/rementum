import { NextRequest } from "next/server";
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

const { DELETE, GET, POST } = await import("./route");

const site = "https://rementum.example.test";
const token = "session-token";
const fetchMock = vi.fn();

type RequestInitFor = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

function request(method: string, path: string, init: RequestInitFor = {}): NextRequest {
  return new NextRequest(`${site}${path}`, { method, ...init });
}

function params(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set("rementum_session", token);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", site);
  vi.stubEnv("REMENTUM_API_INTERNAL_URL", "http://api:8787");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("session bridge", () => {
  it("refuses to forward without a session cookie", async () => {
    cookieJar.clear();
    const response = await GET(request("GET", "/bridge/brains"), params("brains"));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a read with the session cookie, the site origin, and the query string", async () => {
    const response = await GET(
      request("GET", "/bridge/brains?workspaceId=workspace-id&limit=5"),
      params("brains"),
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("http://api:8787/api/v1/brains?workspaceId=workspace-id&limit=5");
    expect(init.headers.get("cookie")).toBe(`rementum_session=${token}`);
    expect(init.headers.get("origin")).toBe(site);
    expect(init.body).toBeUndefined();
  });

  it("rejects a state-changing request from another origin", async () => {
    const response = await POST(
      request("POST", "/bridge/writes", {
        headers: { origin: "https://attacker.example", "content-type": "application/json" },
        body: "{}",
      }),
      params("writes"),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_origin" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a state-changing request with no origin at all", async () => {
    const response = await DELETE(
      request("DELETE", "/bridge/connections/1"),
      params("connections", "1"),
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a same-origin write with its body and content type", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { "content-type": "application/problem+json" } }),
    );
    const response = await POST(
      request("POST", "/bridge/writes", {
        headers: { origin: site, "content-type": "application/json" },
        body: JSON.stringify({ brainId: "brain-id" }),
      }),
      params("writes"),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("http://api:8787/api/v1/writes");
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(Buffer.from(init.body).toString("utf8")).toBe(JSON.stringify({ brainId: "brain-id" }));
  });

  it("does not let a path segment climb out of the versioned API", async () => {
    const response = await GET(
      request("GET", "/bridge/../oauth/token"),
      params("..", "oauth", "token"),
    );
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults the response content type when the API omits one", async () => {
    // A binary body carries no content type of its own, which is what the fallback is for.
    fetchMock.mockResolvedValueOnce(new Response(Buffer.from("[]"), { status: 200 }));
    const response = await GET(request("GET", "/bridge/teams"), params("teams"));
    expect(response.headers.get("content-type")).toBe("application/json");
  });
});
