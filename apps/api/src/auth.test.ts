import type { Actor } from "@rementum/core";
import type { AuthRepository, PostgresStore } from "@rementum/db";
import type { FastifyRequest } from "fastify";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { allAccessScopes } from "./access.js";
import { createAuthenticator } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { OauthRuntime } from "./oauth.js";

const issuer = "https://rementum.example.test/oauth";
const mcpBase = "https://rementum.example.test/mcp";
const userId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";

async function setup() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const kid = "test-key";
  const runtime = {
    issuer,
    publicUrl: "https://rementum.example.test",
    workspaceResource: (id: string) => `${mcpBase}/workspace/${id}`,
    publicJwks: { keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid }] },
  } as unknown as OauthRuntime;
  const store = {
    loadActor: vi.fn(async () => ({
      userId,
      clientId: "test-client",
      systemOwner: false,
      teamRoles: new Map([["00000000-0000-4000-8000-000000000003", "owner"]]),
      workspaceRoles: new Map([[workspaceId, "owner"]]),
      brainRoles: new Map(),
    })),
    scopeActorToWorkspace: vi.fn(async (actor: Actor, id: string) => ({
      ...actor,
      teamRoles: new Map([["00000000-0000-4000-8000-000000000003", "owner"]]),
      workspaceRoles: new Map([[id, actor.workspaceRoles.get(id)]]),
    })),
  } as unknown as PostgresStore;
  const auth = {
    findWebSession: vi.fn(async () => ({ userId })),
  } as unknown as AuthRepository;
  const config = {
    REMENTUM_DEV_AUTH: false,
    REMENTUM_PUBLIC_URL: "https://rementum.example.test",
  } as AppConfig;
  const authenticate = createAuthenticator(config, runtime, store, auth);
  const token = (audience: string, scope: unknown) =>
    new SignJWT({ client_id: "test-client", scope })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(userId)
      .setExpirationTime("5m")
      .sign(privateKey);
  return { authenticate, auth, store, token };
}

function mcpRequest(url: string, token: string): FastifyRequest {
  return { method: "GET", url, headers: { authorization: `Bearer ${token}` } } as FastifyRequest;
}

function webRequest(method = "GET", origin?: string): FastifyRequest {
  return {
    method,
    url: "/api/v1/brains",
    headers: origin ? { origin } : {},
    cookies: { rementum_session: "s".repeat(43) },
  } as unknown as FastifyRequest;
}

describe("web session and MCP OAuth boundaries", () => {
  it("grants a valid web session all first-party API scopes", async () => {
    const { authenticate, store } = await setup();
    const actor = await authenticate(webRequest());
    expect([...actor.scopes]).toEqual(allAccessScopes);
    expect(store.loadActor).toHaveBeenCalledWith(userId, "rementum-web");
  });

  it("binds a workspace MCP request to its exact audience and workspace", async () => {
    const { authenticate, store, token } = await setup();
    const actor = await authenticate(
      mcpRequest(
        `/mcp/workspace/${workspaceId}`,
        await token(`${mcpBase}/workspace/${workspaceId}`, "brain:read"),
      ),
    );
    expect(actor.workspaceId).toBe(workspaceId);
    expect([...actor.workspaceRoles.keys()]).toEqual([workspaceId]);
    expect(store.scopeActorToWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
      workspaceId,
    );
  });

  it("rejects a token for another audience at a workspace MCP boundary", async () => {
    const { authenticate, store, token } = await setup();
    await expect(
      authenticate(
        mcpRequest(
          `/mcp/workspace/${workspaceId}`,
          await token("https://rementum.example.test/api", "brain:read"),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_token", status: 401 });
    expect(store.loadActor).not.toHaveBeenCalled();
  });

  it("does not accept OAuth bearer tokens on the REST API", async () => {
    const { authenticate, token } = await setup();
    await expect(
      authenticate(
        mcpRequest(
          "/api/v1/brains",
          await token("https://rementum.example.test/api", "brain:read"),
        ),
      ),
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });

  it("fails closed for a non-string MCP scope claim", async () => {
    const { authenticate, token } = await setup();
    const actor = await authenticate(
      mcpRequest(
        `/mcp/workspace/${workspaceId}`,
        await token(`${mcpBase}/workspace/${workspaceId}`, ["brain:read"]),
      ),
    );
    expect([...actor.scopes]).toEqual([]);
  });

  it("requires the public origin for a web session mutation", async () => {
    const { authenticate } = await setup();
    await expect(authenticate(webRequest("POST"))).rejects.toMatchObject({
      code: "invalid_origin",
      status: 403,
    });
    await expect(
      authenticate(webRequest("POST", "https://rementum.example.test")),
    ).resolves.toMatchObject({ userId });
  });
});
