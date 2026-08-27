import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { requireTurnstile, verifyTurnstileToken } from "./turnstile.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubSiteverify(
  response: { ok: boolean; body?: unknown } | Error,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return {
      ok: response.ok,
      json: async () => response.body ?? { success: false },
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("verifyTurnstileToken", () => {
  it("posts the secret, token, and client address to siteverify", async () => {
    const fetchMock = stubSiteverify({ ok: true, body: { success: true } });
    await expect(
      verifyTurnstileToken("0x4AAA-secret", "widget-token", "203.0.113.9"),
    ).resolves.toBe(true);
    const [url, init] = vi.mocked(fetchMock).mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = new URLSearchParams(init.body);
    expect(body.get("secret")).toBe("0x4AAA-secret");
    expect(body.get("response")).toBe("widget-token");
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });

  it("omits remoteip when the client address is unknown", async () => {
    const fetchMock = stubSiteverify({ ok: true, body: { success: true } });
    await expect(verifyTurnstileToken("0x4AAA-secret", "widget-token")).resolves.toBe(true);
    const [, init] = vi.mocked(fetchMock).mock.calls[0] as unknown as [string, { body: string }];
    expect(new URLSearchParams(init.body).get("remoteip")).toBeNull();
  });

  it("rejects a failed challenge", async () => {
    stubSiteverify({
      ok: true,
      body: { success: false, "error-codes": ["invalid-input-response"] },
    });
    await expect(verifyTurnstileToken("0x4AAA-secret", "widget-token")).resolves.toBe(false);
  });

  it("fails closed when cloudflare is unreachable", async () => {
    stubSiteverify(new Error("connection refused"));
    await expect(verifyTurnstileToken("0x4AAA-secret", "widget-token")).resolves.toBe(false);
  });

  it("fails closed on a non-200 answer", async () => {
    stubSiteverify({ ok: false, body: { success: true } });
    await expect(verifyTurnstileToken("0x4AAA-secret", "widget-token")).resolves.toBe(false);
  });

  it("fails closed on a malformed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => Promise.reject(new Error("not json")) })),
    );
    await expect(verifyTurnstileToken("0x4AAA-secret", "widget-token")).resolves.toBe(false);
  });
});

describe("requireTurnstile", () => {
  const config = { REMENTUM_TURNSTILE_SECRET_KEY: "0x4AAA-secret" } as AppConfig;

  it("is a no-op when turnstile is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(requireTurnstile({} as AppConfig, undefined, undefined)).resolves.toBeUndefined();
    await expect(
      requireTurnstile({} as AppConfig, "widget-token", "203.0.113.9"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing token", async () => {
    await expect(requireTurnstile(config, undefined, "203.0.113.9")).rejects.toMatchObject({
      code: "turnstile_failed",
      status: 403,
    });
  });

  it("refuses a token the verifier rejects", async () => {
    stubSiteverify({ ok: true, body: { success: false } });
    await expect(requireTurnstile(config, "widget-token", "203.0.113.9")).rejects.toMatchObject({
      code: "turnstile_failed",
    });
  });

  it("accepts a token the verifier accepts", async () => {
    stubSiteverify({ ok: true, body: { success: true } });
    await expect(requireTurnstile(config, "widget-token", "203.0.113.9")).resolves.toBeUndefined();
  });
});
