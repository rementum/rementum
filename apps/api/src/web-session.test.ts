import cookie from "@fastify/cookie";
import { hashContent } from "@rementum/core";
import type { AuthRepository } from "@rementum/db";
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { registerProblemDetails } from "./problems.js";
import { registerWebSessionRoutes, WEB_SESSION_COOKIE } from "./web-session.js";

const publicUrl = "https://rementum.example.test";
const userId = "00000000-0000-4000-8000-000000000001";

interface Harness {
  app: FastifyInstance;
  auth: AuthRepository;
  verifyCredentials: ReturnType<typeof vi.fn>;
}

async function harness(configOverride: Partial<AppConfig> = {}): Promise<Harness> {
  const publicUrlOverride = configOverride.REMENTUM_PUBLIC_URL ?? publicUrl;
  const app = Fastify();
  await app.register(cookie);
  const auth = {
    createWebSession: vi.fn(async () => undefined),
    revokeWebSession: vi.fn(async () => undefined),
    findWebSession: vi.fn(async () => ({ userId })),
  } as unknown as AuthRepository;
  const verifyCredentials = vi.fn(async () => ({
    id: userId,
    email: "person@example.test",
    emailVerifiedAt: new Date(),
  }));
  await registerWebSessionRoutes(
    app,
    auth,
    verifyCredentials as never,
    {
      ...configOverride,
      REMENTUM_PUBLIC_URL: publicUrlOverride,
    } as AppConfig,
  );
  registerProblemDetails(app, publicUrlOverride);
  return { app, auth, verifyCredentials };
}

let context: Harness;
const credentials = { email: " Person@Example.test ", password: "the passphrase" };

beforeEach(async () => {
  context = await harness();
});

function signIn(
  payload: Record<string, unknown> = credentials,
  origin: string | null = publicUrl,
): Promise<LightMyRequestResponse> {
  return context.app.inject({
    method: "POST",
    url: "/api/v1/auth/session",
    headers: origin ? { origin } : {},
    payload,
  });
}

describe("sign in", () => {
  it("issues an opaque cookie and stores only its hash", async () => {
    const response = await signIn();
    expect(response.statusCode).toBe(204);
    const token = response.cookies.find((entry) => entry.name === WEB_SESSION_COOKIE);
    expect(token?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    const [storedUserId, tokenHash, expiresAt] = vi.mocked(context.auth.createWebSession).mock
      .calls[0] as [string, string, Date];
    expect(storedUserId).toBe(userId);
    expect(tokenHash).toBe(hashContent(token?.value ?? ""));
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("leaves the cookie insecure on a plain-HTTP instance", async () => {
    const plain = await harness({ REMENTUM_PUBLIC_URL: "http://localhost" });
    const response = await plain.app.inject({
      method: "POST",
      url: "/api/v1/auth/session",
      headers: { origin: "http://localhost" },
      payload: credentials,
    });
    const token = response.cookies.find((entry) => entry.name === WEB_SESSION_COOKIE);
    expect(token?.secure).toBeUndefined();
    expect(token?.httpOnly).toBe(true);
  });

  it("refuses a sign-in posted from another origin", async () => {
    const response = await signIn(credentials, "https://attacker.example");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "invalid_origin" });
    expect(context.verifyCredentials).not.toHaveBeenCalled();
  });

  it("refuses a sign-in with no origin header at all", async () => {
    expect((await signIn(credentials, null)).statusCode).toBe(403);
  });

  it("answers the same way for a wrong password and an unknown address", async () => {
    context.verifyCredentials.mockResolvedValue(null);
    const response = await signIn();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "invalid_credentials" });
    expect(context.auth.createWebSession).not.toHaveBeenCalled();
  });

  it("does not start a session for an unverified address", async () => {
    context.verifyCredentials.mockResolvedValue({
      id: userId,
      email: "person@example.test",
      emailVerifiedAt: null,
    });
    const response = await signIn();
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "email_unverified" });
    expect(context.auth.createWebSession).not.toHaveBeenCalled();
  });

  it("rejects an oversized password before hashing it", async () => {
    const response = await signIn({ email: "person@example.test", password: "x".repeat(1001) });
    expect(response.statusCode).toBe(400);
    expect(context.verifyCredentials).not.toHaveBeenCalled();
  });
});

describe("turnstile protection", () => {
  afterEach(() => vi.unstubAllGlobals());

  const protectedConfig = {
    REMENTUM_TURNSTILE_SITE_KEY: "0x4AAAAAAA-site",
    REMENTUM_TURNSTILE_SECRET_KEY: "0x4AAAAAAA-secret",
  };

  function stubSiteverify(success: boolean) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ success }) })),
    );
  }

  async function guardedSignIn(
    payload: Record<string, unknown>,
  ): Promise<{ response: LightMyRequestResponse; guarded: Harness }> {
    const guarded = await harness(protectedConfig);
    const response = await guarded.app.inject({
      method: "POST",
      url: "/api/v1/auth/session",
      headers: { origin: publicUrl },
      payload,
    });
    return { response, guarded };
  }

  it("does not touch cloudflare when turnstile is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await signIn()).statusCode).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a sign-in without a token", async () => {
    const { response, guarded } = await guardedSignIn(credentials);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "turnstile_failed" });
    expect(guarded.verifyCredentials).not.toHaveBeenCalled();
  });

  it("refuses a sign-in with a token cloudflare rejects", async () => {
    stubSiteverify(false);
    const { response, guarded } = await guardedSignIn({
      ...credentials,
      turnstileToken: "tok".repeat(10),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "turnstile_failed" });
    expect(guarded.verifyCredentials).not.toHaveBeenCalled();
  });

  it("signs in when the token verifies", async () => {
    stubSiteverify(true);
    const { response } = await guardedSignIn({ ...credentials, turnstileToken: "tok".repeat(10) });
    expect(response.statusCode).toBe(204);
  });
});

describe("session lifetime", () => {
  it("reports an authenticated session for a well-formed cookie", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      cookies: { [WEB_SESSION_COOKIE]: "s".repeat(43) },
    });
    expect(response.json()).toEqual({ authenticated: true });
  });

  it("rejects a session the repository does not know", async () => {
    vi.mocked(context.auth.findWebSession).mockResolvedValueOnce(null);
    const response = await context.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      cookies: { [WEB_SESSION_COOKIE]: "s".repeat(43) },
    });
    expect(response.statusCode).toBe(401);
  });

  it("never looks up a cookie that is not shaped like a token", async () => {
    for (const value of ["", "short", `${"s".repeat(43)}!`, "s".repeat(44)]) {
      const response = await context.app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        cookies: { [WEB_SESSION_COOKIE]: value },
      });
      expect(response.statusCode).toBe(401);
    }
    expect(context.auth.findWebSession).not.toHaveBeenCalled();
  });

  it("revokes the stored session and clears the cookie on sign out", async () => {
    const token = "s".repeat(43);
    const response = await context.app.inject({
      method: "DELETE",
      url: "/api/v1/auth/session",
      headers: { origin: publicUrl },
      cookies: { [WEB_SESSION_COOKIE]: token },
    });
    expect(response.statusCode).toBe(204);
    expect(context.auth.revokeWebSession).toHaveBeenCalledWith(hashContent(token));
    expect(response.cookies.find((entry) => entry.name === WEB_SESSION_COOKIE)?.value).toBe("");
  });

  it("refuses a sign-out posted from another origin", async () => {
    const response = await context.app.inject({
      method: "DELETE",
      url: "/api/v1/auth/session",
      headers: { origin: "https://attacker.example" },
      cookies: { [WEB_SESSION_COOKIE]: "s".repeat(43) },
    });
    expect(response.statusCode).toBe(403);
    expect(context.auth.revokeWebSession).not.toHaveBeenCalled();
  });

  it("still clears the cookie when the request carries no session", async () => {
    const response = await context.app.inject({
      method: "DELETE",
      url: "/api/v1/auth/session",
      headers: { origin: publicUrl },
    });
    expect(response.statusCode).toBe(204);
    expect(context.auth.revokeWebSession).not.toHaveBeenCalled();
  });
});
