import { DomainError, ForbiddenError, type RementumService } from "@rementum/core";
import type { AuthRepository } from "@rementum/db";
import { hash } from "argon2";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allAccessScopes, type ScopedActor, withAccessScopes } from "./access.js";
import type { AppConfig } from "./config.js";
import type { TransactionalMailer } from "./mailer.js";
import { registerProblemDetails } from "./problems.js";
import { registerApiRoutes } from "./routes.js";

const publicUrl = "https://rementum.example.test";
const userId = "00000000-0000-4000-8000-000000000001";
const brainId = "00000000-0000-4000-8000-000000000002";
const workspaceId = "00000000-0000-4000-8000-000000000003";
const teamId = "00000000-0000-4000-8000-000000000004";
const grantId = "grant-id";
const token = "t".repeat(43);
const registration = {
  email: "New@Example.Test",
  displayName: "New person",
  password: "correct horse battery",
  teamName: "Product Team",
};

function actorWith(scopes: string = allAccessScopes.join(" ")): ScopedActor {
  return withAccessScopes(
    {
      userId,
      clientId: "rementum-web",
      systemOwner: false,
      teamRoles: new Map([[teamId, "owner"]]),
      workspaceRoles: new Map([[workspaceId, "owner"]]),
      brainRoles: new Map([[brainId, "owner"]]),
    },
    scopes,
    workspaceId,
  );
}

interface Harness {
  app: FastifyInstance;
  service: RementumService;
  auth: AuthRepository;
  mailer: TransactionalMailer;
  authenticate: ReturnType<typeof vi.fn>;
}

async function harness(config: Partial<AppConfig> = {}, withMailer = true): Promise<Harness> {
  const app = Fastify();
  const service = {
    listTeams: vi.fn(async () => [{ id: teamId }]),
    listWorkspaces: vi.fn(async () => [{ id: workspaceId, llmCompactionEnabled: false }]),
    listBrains: vi.fn(async () => ({ items: [{ id: brainId }], total: 1 })),
    countArticlesByBrain: vi.fn(async () => [
      { brainId, articleCount: 2, latestArticleUpdatedAt: "2026-08-27T10:00:00.000Z" },
    ]),
    listWorkspaceReviewQueue: vi.fn(async () => ({ items: [], counts: [] })),
    listBrainInvitations: vi.fn(async () => []),
    approveInvite: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000010",
      brainId,
      email: "invited@example.test",
      role: "viewer",
      expiresAt: "2026-01-09T00:00:00.000Z",
      createdAt: "2026-01-02T00:00:00.000Z",
      awaitingApproval: false,
      proposedByClient: "agent",
      token: "approved-token",
    })),
    getBrainInvitationOrThrow: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000010",
      brainId,
    })),
    revokeInvite: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000010", brainId })),
    getMcpAnalytics: vi.fn(async (_workspaceId, range, _actor, filteredBrainId) => ({
      scope: { workspaceId, brainId: filteredBrainId ?? null },
      range,
    })),
    getBrain: vi.fn(async () => ({
      brain: { id: brainId, slug: "product" },
      routingIndex: [{ id: "article-id", slug: "architecture" }],
      articleTotal: 1,
    })),
    readArticle: vi.fn(async () => ({
      id: "article-id",
      slug: "architecture",
      title: "Architecture",
      summary: "How the system fits together.",
      kind: "canonical",
      currentVersion: 3,
      body: "# Architecture\n",
    })),
    exportBrain: vi.fn(async () => ({
      brain: { id: brainId, slug: "product" },
      articles: [
        {
          slug: "architecture",
          title: "Architecture",
          summary: "How the system fits together.",
          kind: "canonical",
          version: 3,
          body: "# Architecture\n",
        },
      ],
    })),
    getWriteStatus: vi.fn(async () => ({
      id: "write-id",
      status: "pending",
      body: Buffer.from("secret"),
      bodyAad: "brain:x:article:y:version:1",
    })),
    proposeInvite: vi.fn(async () => ({ id: "invite-id", token, expiresAt: "2026-01-01" })),
    getInstanceOverview: vi.fn(async () => ({
      generatedAt: "2026-09-02T12:00:00.000Z",
      timeZone: "UTC",
    })),
    listInstanceUsers: vi.fn(async (input) => ({ items: [], total: 0, ...input })),
  } as unknown as RementumService;
  const auth = {
    registerAccount: vi.fn(async () => ({ user: { id: userId } })),
    reclaimUnverifiedAccount: vi.fn(async () => null),
    createAuthToken: vi.fn(async () => ({ id: "token-id" })),
    findUserByEmail: vi.fn(async () => null),
    findUserById: vi.fn(async () => ({ id: userId, email: "invited@example.test" })),
    verifyEmail: vi.fn(async () => true),
    resetPassword: vi.fn(async () => true),
    inspectBrainInvitation: vi.fn(async () => ({
      email: "invited@example.test",
      name: "Product knowledge",
      role: "editor",
    })),
    acceptBrainInvitation: vi.fn(async () => ({ brainId, role: "editor" })),
    listConnections: vi.fn(async () => [{ grantId }]),
    revokeConnection: vi.fn(async () => true),
  } as unknown as AuthRepository;
  const mailer = { send: vi.fn(async () => ({ id: "email-id" })) } satisfies TransactionalMailer;
  const authenticate = vi.fn(async (_request: FastifyRequest) => actorWith());
  await registerApiRoutes(
    app,
    service,
    authenticate as unknown as (request: FastifyRequest) => Promise<ScopedActor>,
    auth,
    {
      REMENTUM_PUBLIC_URL: publicUrl,
      REMENTUM_ALLOW_SIGNUP: true,
      REMENTUM_LLM_ENABLED: false,
      ...config,
    } as AppConfig,
    withMailer ? mailer : null,
  );
  registerProblemDetails(app, publicUrl);
  return { app, service, auth, mailer, authenticate };
}

/** The 401 the authenticator raises when a request carries no usable session. */
function anonymous(): DomainError {
  return new DomainError("unauthorized", "A valid web session is required", 401);
}

let context: Harness;

beforeEach(async () => {
  context = await harness();
});

describe("registration", () => {
  it("reports whether public signup is open and whether bot protection is configured", async () => {
    const open = await context.app.inject({ method: "GET", url: "/api/v1/auth/config" });
    expect(open.json()).toEqual({ signupEnabled: true, turnstileSiteKey: null });
    const closed = await harness({ REMENTUM_ALLOW_SIGNUP: false });
    const response = await closed.app.inject({ method: "GET", url: "/api/v1/auth/config" });
    expect(response.json()).toEqual({ signupEnabled: false, turnstileSiteKey: null });
    const guarded = await harness({
      REMENTUM_TURNSTILE_SITE_KEY: "0x4AAAAAAA-site",
      REMENTUM_TURNSTILE_SECRET_KEY: "0x4AAAAAAA-secret",
    });
    const protectedConfig = await guarded.app.inject({
      method: "GET",
      url: "/api/v1/auth/config",
    });
    expect(protectedConfig.json()).toEqual({
      signupEnabled: true,
      turnstileSiteKey: "0x4AAAAAAA-site",
    });
  });

  it("refuses registration on an invitation-only instance", async () => {
    const { app, auth } = await harness({ REMENTUM_ALLOW_SIGNUP: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: registration,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "signup_disabled" });
    expect(auth.registerAccount).not.toHaveBeenCalled();
  });

  it("normalises the address, derives a team slug, and sends one verification link", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: registration,
    });
    expect(response.statusCode).toBe(202);
    const [email, displayName, passwordHash, teamName, teamSlug] = vi.mocked(
      context.auth.registerAccount,
    ).mock.calls[0] as string[];
    expect(email).toBe("new@example.test");
    expect(displayName).toBe("New person");
    expect(passwordHash?.startsWith("$argon2id$")).toBe(true);
    expect(teamName).toBe("Product Team");
    expect(teamSlug).toMatch(/^product-team-[0-9a-f]{12}$/);
    expect(context.mailer.send).toHaveBeenCalledOnce();
    const message = vi.mocked(context.mailer.send).mock.calls[0]?.[0];
    expect(message?.to).toBe("new@example.test");
    expect(message?.text).toContain(`${publicUrl}/verify-email?token=`);
  });

  it("answers the same way for an address that is already taken", async () => {
    vi.mocked(context.auth.registerAccount).mockResolvedValueOnce(null);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: registration,
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      message: "If this address can be registered, a verification email has been sent.",
    });
    expect(context.mailer.send).not.toHaveBeenCalled();
  });

  it("rejects a password below the minimum length", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { ...registration, password: "short" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({
      code: "validation",
      detail: expect.stringContaining("password"),
    });
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

  it("refuses registration without a token", async () => {
    const { app, auth } = await harness(protectedConfig);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: registration,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "turnstile_failed" });
    expect(auth.registerAccount).not.toHaveBeenCalled();
  });

  it("refuses registration with a token cloudflare rejects", async () => {
    stubSiteverify(false);
    const { app, auth } = await harness(protectedConfig);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { ...registration, turnstileToken: "tok".repeat(10) },
    });
    expect(response.statusCode).toBe(403);
    expect(auth.registerAccount).not.toHaveBeenCalled();
  });

  it("registers when the token verifies", async () => {
    stubSiteverify(true);
    const { app, auth } = await harness(protectedConfig);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { ...registration, turnstileToken: "tok".repeat(10) },
    });
    expect(response.statusCode).toBe(202);
    expect(auth.registerAccount).toHaveBeenCalledOnce();
  });

  it("refuses a verification resend and a reset request without a token", async () => {
    const { app, mailer } = await harness(protectedConfig);
    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: "person@example.test" },
    });
    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "person@example.test" },
    });
    expect(resend.statusCode).toBe(403);
    expect(reset.statusCode).toBe(403);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("sends both emails once a token verifies", async () => {
    stubSiteverify(true);
    const { app, auth, mailer } = await harness(protectedConfig);
    vi.mocked(auth.findUserByEmail).mockResolvedValue({
      id: userId,
      email: "person@example.test",
      emailVerifiedAt: null,
    } as never);
    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: "person@example.test", turnstileToken: "tok".repeat(10) },
    });
    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "person@example.test", turnstileToken: "tok".repeat(10) },
    });
    expect(resend.statusCode).toBe(202);
    expect(reset.statusCode).toBe(202);
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });
});

describe("email verification and password reset", () => {
  it("resends verification only while the address is unverified", async () => {
    vi.mocked(context.auth.findUserByEmail).mockResolvedValueOnce({
      id: userId,
      email: "person@example.test",
      emailVerifiedAt: new Date(),
    } as never);
    const verified = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: "person@example.test" },
    });
    expect(verified.statusCode).toBe(202);
    expect(context.mailer.send).not.toHaveBeenCalled();

    vi.mocked(context.auth.findUserByEmail).mockResolvedValueOnce({
      id: userId,
      email: "person@example.test",
      emailVerifiedAt: null,
    } as never);
    await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: "person@example.test" },
    });
    expect(context.mailer.send).toHaveBeenCalledOnce();
  });

  it("reports an unusable verification link as gone", async () => {
    vi.mocked(context.auth.verifyEmail).mockResolvedValueOnce(false);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: "invalid_token" });
  });

  it("accepts a valid verification link", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });
    expect(response.statusCode).toBe(204);
  });

  it("does not reveal whether a reset address exists", async () => {
    const unknown = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "nobody@example.test" },
    });
    expect(unknown.statusCode).toBe(202);
    expect(context.mailer.send).not.toHaveBeenCalled();

    vi.mocked(context.auth.findUserByEmail).mockResolvedValueOnce({
      id: userId,
      email: "person@example.test",
    } as never);
    const known = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "person@example.test" },
    });
    expect(known.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    const message = vi.mocked(context.mailer.send).mock.calls[0]?.[0];
    expect(message?.text).toContain(`${publicUrl}/reset-password?token=`);
  });

  it("refuses password reset when email delivery is not configured", async () => {
    const { app } = await harness({}, false);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "person@example.test" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "email_unavailable" });
  });

  it("stores an argon2 hash for an accepted reset and rejects a stale link", async () => {
    const accepted = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, password: "a whole new passphrase" },
    });
    expect(accepted.statusCode).toBe(204);
    const [, passwordHash] = vi.mocked(context.auth.resetPassword).mock.calls[0] as string[];
    expect(passwordHash?.startsWith("$argon2id$")).toBe(true);

    vi.mocked(context.auth.resetPassword).mockResolvedValueOnce(false);
    const stale = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, password: "a whole new passphrase" },
    });
    expect(stale.statusCode).toBe(410);
  });
});

describe("brain invitations", () => {
  it("describes an invitation without exposing the invited address", async () => {
    vi.mocked(context.auth.findUserByEmail).mockResolvedValueOnce({
      id: userId,
      emailVerifiedAt: new Date(),
    } as never);
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/invitations/${token}`,
    });
    expect(response.json()).toEqual({
      name: "Product knowledge",
      role: "editor",
      existingAccount: true,
      loginRequired: true,
    });
    expect(JSON.stringify(response.json())).not.toContain("invited@example.test");
  });

  it("reports an unknown invitation as gone", async () => {
    vi.mocked(context.auth.inspectBrainInvitation).mockResolvedValueOnce(null);
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/invitations/${token}`,
    });
    expect(response.statusCode).toBe(410);
  });

  it("accepts an invitation for the signed-in account it was addressed to", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      payload: { token },
    });
    expect(response.statusCode).toBe(201);
    expect(context.auth.acceptBrainInvitation).toHaveBeenCalledWith(
      expect.any(String),
      userId,
      null,
      null,
    );
  });

  it("refuses an invitation addressed to a different account", async () => {
    vi.mocked(context.auth.findUserById).mockResolvedValueOnce({
      id: userId,
      email: "someone.else@example.test",
    } as never);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      payload: { token },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "wrong_account" });
    expect(context.auth.acceptBrainInvitation).not.toHaveBeenCalled();
  });

  it("asks an anonymous visitor with a verified account to sign in first", async () => {
    context.authenticate.mockRejectedValue(anonymous());
    vi.mocked(context.auth.findUserByEmail).mockResolvedValueOnce({
      id: userId,
      emailVerifiedAt: new Date(),
      passwordHash: "unused",
    } as never);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      payload: { token },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "login_required" });
  });

  it("lets an unverified invited account accept with its own password", async () => {
    context.authenticate.mockRejectedValue(anonymous());
    vi.mocked(context.auth.findUserByEmail).mockResolvedValueOnce({
      id: userId,
      emailVerifiedAt: null,
      passwordHash: await hash("the current passphrase"),
    } as never);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      payload: { token, password: "the current passphrase" },
    });
    expect(response.statusCode).toBe(201);
    expect(context.auth.acceptBrainInvitation).toHaveBeenCalledWith(
      expect.any(String),
      userId,
      null,
      null,
    );
  });

  it("requires a name and password to create an account from an invitation", async () => {
    context.authenticate.mockRejectedValue(anonymous());
    const missing = await context.app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      payload: { token },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: "account_details_required" });

    const created = await context.app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      payload: { token, displayName: "New person", password: "correct horse battery" },
    });
    expect(created.statusCode).toBe(201);
    const [, id, displayName, passwordHash] = vi.mocked(context.auth.acceptBrainInvitation).mock
      .calls[0] as [string, string | null, string, string];
    expect(id).toBeNull();
    expect(displayName).toBe("New person");
    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
  });
});

describe("authorization", () => {
  it("refuses a token that is missing the scope a route needs", async () => {
    context.authenticate.mockResolvedValue(actorWith("brain:read"));
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/brains",
      payload: { name: "Product knowledge", workspaceId },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "insufficient_scope" });
    expect(response.headers["www-authenticate"]).toBe(
      'Bearer error="insufficient_scope", scope="brain:write"',
    );
  });

  it("rejects a malformed identifier before reaching the service", async () => {
    const response = await context.app.inject({ method: "GET", url: "/api/v1/brains/not-a-uuid" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation" });
    expect(context.service.getBrain).not.toHaveBeenCalled();
  });

  it("marks actor-scoped responses uncacheable", async () => {
    const response = await context.app.inject({ method: "GET", url: "/api/v1/brains" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});

describe("article counts", () => {
  it("serves the counts from the static route, not the :brainId parameter", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/v1/brains/article-counts",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { brainId, articleCount: 2, latestArticleUpdatedAt: "2026-08-27T10:00:00.000Z" },
    ]);
    expect(context.service.getBrain).not.toHaveBeenCalled();
  });
});

describe("routing index sort", () => {
  it("defaults the brain detail sort to recency", async () => {
    const response = await context.app.inject({ method: "GET", url: `/api/v1/brains/${brainId}` });
    expect(response.statusCode).toBe(200);
    expect(context.service.getBrain).toHaveBeenCalledWith(
      brainId,
      expect.anything(),
      200,
      "updated",
      0,
    );
  });

  it("forwards an allowlisted sort value", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains/${brainId}?sort=title`,
    });
    expect(response.statusCode).toBe(200);
    expect(context.service.getBrain).toHaveBeenCalledWith(
      brainId,
      expect.anything(),
      200,
      "title",
      0,
    );
  });

  it("rejects an unknown sort value before reaching the service", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains/${brainId}?sort=updated_at%20DESC`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation" });
    expect(context.service.getBrain).not.toHaveBeenCalled();
  });
});

describe("list pagination", () => {
  it("forwards brain paging and filter params to the service", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains?workspaceId=${workspaceId}&shared=true&sort=name&limit=5&offset=10`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [{ id: brainId }], total: 1 });
    expect(context.service.listBrains).toHaveBeenCalledWith(expect.anything(), {
      workspaceId,
      shared: true,
      sort: "name",
      limit: 5,
      offset: 10,
    });
  });

  it("rejects an out-of-range brain page size", async () => {
    const response = await context.app.inject({ method: "GET", url: "/api/v1/brains?limit=0" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation" });
    expect(context.service.listBrains).not.toHaveBeenCalled();
  });

  it("forwards the routing index page to the service", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains/${brainId}?limit=50&offset=100`,
    });
    expect(response.statusCode).toBe(200);
    expect(context.service.getBrain).toHaveBeenCalledWith(
      brainId,
      expect.anything(),
      50,
      "updated",
      100,
    );
  });

  it("rejects a negative routing index offset", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains/${brainId}?offset=-1`,
    });
    expect(response.statusCode).toBe(400);
    expect(context.service.getBrain).not.toHaveBeenCalled();
  });
});

describe("workspaces and connections", () => {
  it("advertises the workspace MCP endpoint and whether compaction is available", async () => {
    const off = await context.app.inject({ method: "GET", url: "/api/v1/workspaces" });
    expect(off.json()).toEqual([
      {
        id: workspaceId,
        llmCompactionEnabled: false,
        llmCompactionAvailable: false,
        mcpUrl: `${publicUrl}/mcp/workspace/${workspaceId}`,
      },
    ]);

    const configured = await harness({
      REMENTUM_LLM_ENABLED: true,
      REMENTUM_LLM_BASE_URL: "https://provider.example.test/v1",
      REMENTUM_LLM_MODEL: "a-model",
    });
    const on = await configured.app.inject({ method: "GET", url: "/api/v1/workspaces" });
    expect(on.json()[0].llmCompactionAvailable).toBe(true);
  });

  it("approves a proposed invitation, mints the link, and revokes on request", async () => {
    const invitationId = "00000000-0000-4000-8000-000000000010";
    const approved = await context.app.inject({
      method: "POST",
      url: `/api/v1/brains/${brainId}/invitations/${invitationId}/approve`,
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      id: invitationId,
      acceptanceUrl: `${publicUrl}/invite/approved-token`,
      emailSent: true,
    });
    expect(context.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "invited@example.test" }),
    );

    const otherBrain = "00000000-0000-4000-8000-000000000099";
    const wrongBrain = await context.app.inject({
      method: "POST",
      url: `/api/v1/brains/${otherBrain}/invitations/${invitationId}/approve`,
    });
    expect(wrongBrain.statusCode).toBe(404);

    const revoked = await context.app.inject({
      method: "DELETE",
      url: `/api/v1/brains/${brainId}/invitations/${invitationId}`,
    });
    expect(revoked.statusCode).toBe(204);
    expect(context.service.revokeInvite).toHaveBeenCalledWith(invitationId, expect.anything());

    const listed = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains/${brainId}/invitations`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([]);
  });

  it("serves the workspace review queue with a bounded limit", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/review-queue?limit=25`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], counts: [] });
    expect(context.service.listWorkspaceReviewQueue).toHaveBeenCalledWith(
      workspaceId,
      expect.anything(),
      25,
    );

    const invalid = await context.app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/review-queue?limit=5000`,
    });
    expect(invalid.statusCode).toBe(400);

    context.authenticate.mockResolvedValue(actorWith("team:read"));
    const forbidden = await context.app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/review-queue`,
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("validates and forwards workspace analytics filters", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/analytics?range=90d&brainId=${brainId}`,
    });
    expect(response.statusCode).toBe(200);
    expect(context.service.getMcpAnalytics).toHaveBeenCalledWith(
      workspaceId,
      "90d",
      expect.anything(),
      brainId,
    );

    const invalid = await context.app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/analytics?range=all`,
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("reports whether a connection was there to revoke", async () => {
    const revoked = await context.app.inject({
      method: "DELETE",
      url: `/api/v1/connections/${grantId}`,
    });
    expect(revoked.statusCode).toBe(204);
    expect(context.auth.revokeConnection).toHaveBeenCalledWith(userId, grantId);

    vi.mocked(context.auth.revokeConnection).mockResolvedValueOnce(false);
    const missing = await context.app.inject({
      method: "DELETE",
      url: `/api/v1/connections/${grantId}`,
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe("staged writes and export", () => {
  it("never returns an encrypted body or its binding with a write", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: "/api/v1/writes/00000000-0000-4000-8000-000000000005",
    });
    expect(response.json()).toEqual({ id: "write-id", status: "pending" });
  });

  it("exports the brain as a zip with a manifest", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains/${brainId}/export`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="product-export.zip"',
    );
    const zip = await JSZip.loadAsync(response.rawPayload);
    expect(Object.keys(zip.files).sort()).toEqual(["architecture.md", "manifest.json"]);
    const manifest = JSON.parse(
      await (zip.file("manifest.json") as JSZip.JSZipObject).async("string"),
    );
    expect(manifest).toMatchObject({
      format: "rementum-export-v1",
      articles: [{ slug: "architecture", version: 3 }],
    });
    const article = await (zip.file("architecture.md") as JSZip.JSZipObject).async("string");
    expect(article).toContain('title: "Architecture"');
    expect(article).toContain("# Architecture");
  });

  it("keeps a non-owner out of the export", async () => {
    context.authenticate.mockResolvedValue(
      withAccessScopes(
        {
          userId,
          clientId: "rementum-web",
          systemOwner: false,
          teamRoles: new Map(),
          workspaceRoles: new Map(),
          brainRoles: new Map([[brainId, "viewer"]]),
        },
        "brain:read",
        workspaceId,
      ),
    );
    const response = await context.app.inject({
      method: "GET",
      url: `/api/v1/brains/${brainId}/export`,
    });
    expect(response.statusCode).toBe(403);
    expect(context.service.exportBrain).not.toHaveBeenCalled();
  });
});

describe("instance administration", () => {
  it("serves the overview to the signed-in actor as the service returns it", async () => {
    const response = await context.app.inject({ method: "GET", url: "/api/v1/admin/overview" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      generatedAt: "2026-09-02T12:00:00.000Z",
      timeZone: "UTC",
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(context.service.getInstanceOverview).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
    );
  });

  it("defaults and bounds the accounts query before it reaches the service", async () => {
    const listed = await context.app.inject({
      method: "GET",
      url: "/api/v1/admin/accounts?query=%20Ada%20",
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ items: [], total: 0, query: "Ada", limit: 50, offset: 0 });
    expect(context.service.listInstanceUsers).toHaveBeenCalledWith(
      { query: "Ada", limit: 50, offset: 0 },
      expect.objectContaining({ userId }),
    );
    const oversized = await context.app.inject({
      method: "GET",
      url: "/api/v1/admin/accounts?limit=500",
    });
    expect(oversized.statusCode).toBe(400);
    expect(context.service.listInstanceUsers).toHaveBeenCalledOnce();
  });

  it("answers 401 without a session and 403 when the service refuses the actor", async () => {
    context.authenticate.mockRejectedValueOnce(anonymous());
    const signedOut = await context.app.inject({ method: "GET", url: "/api/v1/admin/overview" });
    expect(signedOut.statusCode).toBe(401);
    expect(context.service.getInstanceOverview).not.toHaveBeenCalled();

    vi.mocked(context.service.getInstanceOverview).mockRejectedValueOnce(new ForbiddenError());
    const refused = await context.app.inject({ method: "GET", url: "/api/v1/admin/overview" });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: "forbidden" });
  });
});
