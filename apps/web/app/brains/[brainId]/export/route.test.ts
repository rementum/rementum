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

const { GET } = await import("./route");

const site = "https://rementum.example.test";
const brainId = "00000000-0000-4000-8000-000000000001";
const token = "session-token";
const fetchMock = vi.fn();

function params(id: string) {
  return { params: Promise.resolve({ brainId: id }) };
}

function exportRequest(id: string): Request {
  return new Request(`${site}/brains/${id}/export`);
}

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set("rementum_session", token);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("REMENTUM_API_INTERNAL_URL", "http://api:8787");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("brain export proxy", () => {
  it("streams the archive and keeps the API filename", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from("PK"), {
        status: 200,
        headers: { "content-disposition": 'attachment; filename="product-export.zip"' },
      }),
    );
    const response = await GET(exportRequest(brainId), params(brainId));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="product-export.zip"',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api:8787/api/v1/brains/${brainId}/export`,
      expect.objectContaining({ headers: { cookie: `rementum_session=${token}` } }),
    );
  });

  it("names the download when the API omits a disposition", async () => {
    fetchMock.mockResolvedValueOnce(new Response(Buffer.from("PK"), { status: 200 }));
    const response = await GET(exportRequest(brainId), params(brainId));
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename=brain-export.zip",
    );
  });

  it("refuses a brain id that is not a UUID before contacting the API", async () => {
    for (const id of ["not-a-uuid", "../../oauth/token", `${brainId}/../../teams`]) {
      const response = await GET(exportRequest(id), params(id));
      expect(response.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to the login page", async () => {
    cookieJar.clear();
    const response = await GET(exportRequest(brainId), params(brainId));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${site}/auth/login`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes an API refusal through with its status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const response = await GET(exportRequest(brainId), params(brainId));
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("forbidden");
  });
});
