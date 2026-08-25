import type { PostgresStore } from "@rementum/db";
import type { FastifyRequest } from "fastify";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createAuthenticator } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { OauthRuntime } from "./oauth.js";

const issuer = "https://rementum.example.test/oauth";
const apiResource = "https://rementum.example.test/api";
const mcpResource = "https://rementum.example.test/mcp";
const userId = "00000000-0000-4000-8000-000000000001";

async function setup() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const kid = "test-key";
  const runtime = {
    issuer,
    resource: mcpResource,
    apiResource,
    publicJwks: { keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid }] },
  } as OauthRuntime;
  const store = {
    loadActor: vi.fn(async () => ({
      userId,
      clientId: "test-client",
      workspaceRoles: new Map(),
      brainRoles: new Map(),
    })),
  } as unknown as PostgresStore;
  const config = {
    REMENTUM_DEV_AUTH: false,
    REMENTUM_PUBLIC_URL: "https://rementum.example.test",
  } as AppConfig;
  const authenticate = createAuthenticator(config, runtime, store);
  const token = (audience: string, scope: unknown) =>
    new SignJWT({ client_id: "test-client", scope })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(userId)
      .setExpirationTime("5m")
      .sign(privateKey);
  return { authenticate, store, token };
}

function request(url: string, token: string): FastifyRequest {
  return { url, headers: { authorization: `Bearer ${token}` } } as FastifyRequest;
}

describe("OAuth bearer authentication", () => {
  it("preserves exact scopes from an API token", async () => {
    const { authenticate, token } = await setup();
    const actor = await authenticate(
      request("/api/v1/brains", await token(apiResource, "brain:read task:read")),
    );
    expect([...actor.scopes]).toEqual(["brain:read", "task:read"]);
  });

  it("rejects an API token at the MCP audience boundary", async () => {
    const { authenticate, store, token } = await setup();
    await expect(
      authenticate(request("/mcp", await token(apiResource, "brain:read"))),
    ).rejects.toMatchObject({ code: "invalid_token", status: 401 });
    expect(store.loadActor).not.toHaveBeenCalled();
  });

  it("fails closed for a non-string scope claim", async () => {
    const { authenticate, token } = await setup();
    const actor = await authenticate(
      request("/api/v1/brains", await token(apiResource, ["brain:read"])),
    );
    expect([...actor.scopes]).toEqual([]);
  });
});
