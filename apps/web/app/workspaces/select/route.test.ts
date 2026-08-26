import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, { value: string; options: Record<string, unknown> }>();
const workspaceContext = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieJar.set(name, { value, options });
    },
  }),
}));

vi.mock("../../../lib/api", () => ({ workspaceContext }));

const { POST } = await import("./route");

const site = "https://rementum.example.test";

function selectRequest(workspaceId: string, url = `${site}/workspaces/select`): Request {
  const form = new FormData();
  form.set("workspaceId", workspaceId);
  return new Request(url, { method: "POST", body: form });
}

beforeEach(() => {
  cookieJar.clear();
  workspaceContext.mockReset();
  workspaceContext.mockResolvedValue({
    workspaces: [{ id: "workspace-a" }, { id: "workspace-b" }],
  });
  vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", site);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workspace selection", () => {
  it("stores the chosen workspace and returns to the dashboard", async () => {
    const response = await POST(selectRequest("workspace-b"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${site}/`);
    expect(cookieJar.get("rementum_workspace")).toMatchObject({
      value: "workspace-b",
      options: { httpOnly: true, sameSite: "lax", secure: true, path: "/" },
    });
  });

  it("refuses a workspace the session cannot reach", async () => {
    const response = await POST(selectRequest("workspace-from-another-account"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(cookieJar.size).toBe(0);
  });

  it("refuses an empty selection", async () => {
    const form = new FormData();
    const response = await POST(
      new Request(`${site}/workspaces/select`, { method: "POST", body: form }),
    );
    expect(response.status).toBe(403);
  });

  it("leaves the cookie insecure on a plain-HTTP instance", async () => {
    vi.stubEnv("NEXT_PUBLIC_REMENTUM_API_URL", "http://localhost");
    const response = await POST(selectRequest("workspace-a", "http://localhost/workspaces/select"));
    expect(response.status).toBe(303);
    expect(cookieJar.get("rementum_workspace")?.options).toMatchObject({ secure: false });
  });
});
