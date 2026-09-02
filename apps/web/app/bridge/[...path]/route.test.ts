import { NextRequest } from "next/server";
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
  for (const key of [...incomingHeaders.keys()]) incomingHeaders.delete(key);
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

  it("passes the client address chain through so the API can rate limit per client", async () => {
    incomingHeaders.set("x-forwarded-for", "203.0.113.7, 10.0.0.2");
    await GET(request("GET", "/bridge/teams"), params("teams"));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get("x-forwarded-for")).toBe("203.0.113.7, 10.0.0.2");
  });

  it("refuses a body whose declared length exceeds what the API would accept", async () => {
    const response = await POST(
      request("POST", "/bridge/writes", {
        headers: {
          origin: site,
          "content-type": "application/json",
          "content-length": String(2_000_001),
        },
        body: "{}",
      }),
      params("writes"),
    );
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets an archive upload through the higher import limit", async () => {
    const response = await POST(
      request("POST", "/bridge/brains/brain-id/imports/stage", {
        headers: {
          origin: site,
          "content-type": "multipart/form-data; boundary=x",
          "content-length": String(50 * 1024 * 1024),
        },
        body: "--x--",
      }),
      params("brains", "brain-id", "imports", "stage"),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a body it cannot bound because it arrives chunked", async () => {
    const response = await POST(
      request("POST", "/bridge/writes", {
        headers: {
          origin: site,
          "content-type": "application/json",
          "transfer-encoding": "chunked",
        },
        body: "{}",
      }),
      params("writes"),
    );
    expect(response.status).toBe(411);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends no address chain when the edge proxy set none", async () => {
    await GET(request("GET", "/bridge/teams"), params("teams"));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.has("x-forwarded-for")).toBe(false);
  });

  it("defaults the response content type when the API omits one", async () => {
    // A binary body carries no content type of its own, which is what the fallback is for.
    fetchMock.mockResolvedValueOnce(new Response(Buffer.from("[]"), { status: 200 }));
    const response = await GET(request("GET", "/bridge/teams"), params("teams"));
    expect(response.headers.get("content-type")).toBe("application/json");
  });
});
