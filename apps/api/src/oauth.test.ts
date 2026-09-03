import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";
import { verifyLoginPassword } from "./credentials.js";
import {
  buildOauthRuntime,
  type OauthRuntime,
  registerOauthRoutes,
  workspaceIdFromResource,
} from "./oauth.js";

const workspaceId = "00000000-0000-4000-8000-000000000002";

describe("OAuth login verification", () => {
  it("performs one password verification for an unknown account", async () => {
    const verifier = vi.fn(async () => false);
    await expect(verifyLoginPassword(null, "candidate", "dummy-hash", verifier)).resolves.toBe(
      false,
    );
    expect(verifier).toHaveBeenCalledOnce();
    expect(verifier).toHaveBeenCalledWith("dummy-hash", "candidate");
  });

  it("performs one password verification for a known account", async () => {
    const verifier = vi.fn(async () => true);
    await expect(
      verifyLoginPassword({ passwordHash: "user-hash" }, "correct", "dummy-hash", verifier),
    ).resolves.toBe(true);
    expect(verifier).toHaveBeenCalledOnce();
    expect(verifier).toHaveBeenCalledWith("user-hash", "correct");
  });

  it("still performs verification when the password is missing", async () => {
    const verifier = vi.fn(async () => false);
    await expect(
      verifyLoginPassword({ passwordHash: "user-hash" }, undefined, "dummy-hash", verifier),
    ).resolves.toBe(false);
    expect(verifier).toHaveBeenCalledWith("user-hash", "");
  });

  it("cannot authenticate a missing account even if dummy verification succeeds", async () => {
    const verifier = vi.fn(async () => true);
    await expect(verifyLoginPassword(null, "candidate", "dummy-hash", verifier)).resolves.toBe(
      false,
    );
    expect(verifier).toHaveBeenCalledOnce();
  });
});

describe("authorization server metadata", () => {
  it("points the root and path-aware metadata locations at the issuer's discovery document", async () => {
    const app = Fastify();
    await registerOauthRoutes(
      app,
      {
        provider: {} as never,
        publicJwks: { keys: [] },
        issuer: "https://rementum.example.test/oauth",
        publicUrl: "https://rementum.example.test",
        workspaceResource: (id) => `https://rementum.example.test/mcp/workspace/${id}`,
      },
      {} as never,
      {} as never,
    );
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/oauth",
      "/.well-known/openid-configuration",
    ]) {
      const response = await app.inject({ method: "GET", url: path });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(
        "https://rementum.example.test/oauth/.well-known/openid-configuration",
      );
    }
    await app.close();
  });

  it("advertises client id metadata documents next to dynamic registration", async () => {
    const runtime = await buildOauthRuntime(
      loadConfig({
        NODE_ENV: "test",
        REMENTUM_PUBLIC_URL: "https://rementum.example.test",
        REMENTUM_DATABASE_URL: "postgres://owl:secret@localhost/owl",
        REMENTUM_MASTER_KEY: "master-key",
        REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
      }),
      // Discovery never touches the adapter, so no database is needed to read it.
      { sql: undefined } as never,
    );
    const server = createServer(runtime.provider.callback());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/.well-known/openid-configuration`);
      expect(response.status).toBe(200);
      const metadata = await response.json();
      expect(metadata).toMatchObject({
        issuer: "https://rementum.example.test/oauth",
        client_id_metadata_document_supported: true,
        code_challenge_methods_supported: ["S256"],
      });
      // Registration stays on for clients without a hosted document, such as Cursor.
      expect(metadata.registration_endpoint).toMatch(/\/reg$/);
      // Claude only picks a metadata document when it can also act as a public client.
      expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("OAuth web session bridge", () => {
  const uid = "interaction-uid";
  const userId = "00000000-0000-4000-8000-000000000003";
  const resource = `https://rementum.example.test/mcp/workspace/${workspaceId}`;

  async function interactionApp(
    prompt: Record<string, unknown>,
    session: { accountId: string } | undefined,
    webSession: { userId: string; systemOwner: boolean } | null,
    grantId?: string,
  ) {
    const app = Fastify();
    await app.register(cookie);
    const interactionFinished = vi.fn(async (_request, response, result) => {
      response.statusCode = 303;
      response.setHeader("location", "/oauth/auth/resume");
      response.end();
      return result;
    });
    const grant = {
      addOIDCScope: vi.fn(),
      addOIDCClaims: vi.fn(),
      addResourceScope: vi.fn(),
      save: vi.fn(async () => "grant-id"),
    };
    const runtime = {
      provider: {
        interactionDetails: async () => ({
          uid,
          prompt,
          params: { client_id: "test-client", resource },
          session,
          grantId,
        }),
        interactionFinished,
        Grant: { find: vi.fn(async () => grant) },
      },
      publicJwks: { keys: [] },
      issuer: "https://rementum.example.test/oauth",
      publicUrl: "https://rementum.example.test",
      workspaceResource: (id: string) => `https://rementum.example.test/mcp/workspace/${id}`,
    } as unknown as OauthRuntime;
    const auth = { findWebSession: vi.fn(async () => webSession) };
    const actor = { userId };
    const store = {
      loadActor: vi.fn(async () => actor),
      scopeActorToWorkspace: vi.fn(async () => actor),
    };
    await registerOauthRoutes(app, runtime, auth as never, store as never);
    const response = await app.inject({
      method: "GET",
      url: `/oauth/interaction/${uid}`,
      cookies: { rementum_session: "s".repeat(43) },
    });
    await app.close();
    return { response, interactionFinished, grant, auth, store };
  }

  it("sends a browser without a web session through the regular sign-in page", async () => {
    const { response, interactionFinished, store } = await interactionApp(
      { name: "login" },
      undefined,
      null,
    );
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      "/auth/login?returnTo=%2Foauth%2Finteraction%2Finteraction-uid",
    );
    expect(interactionFinished).not.toHaveBeenCalled();
    expect(store.loadActor).not.toHaveBeenCalled();
  });

  it("makes the signed-in web account authoritative over another OAuth session", async () => {
    const { response, interactionFinished, store } = await interactionApp(
      { name: "consent", details: {} },
      { accountId: "another-user" },
      { userId, systemOwner: false },
    );
    expect(response.statusCode).toBe(303);
    expect(store.loadActor).toHaveBeenCalledWith(userId, "test-client");
    expect(store.scopeActorToWorkspace).toHaveBeenCalledWith({ userId }, workspaceId);
    expect(interactionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { login: { accountId: userId, amr: ["pwd"] } },
      { mergeWithLastSubmission: false },
    );
  });

  it("silently grants requested access after membership is verified", async () => {
    const missingResourceScopes = { [resource]: ["brain:read"] };
    const { response, interactionFinished, grant } = await interactionApp(
      {
        name: "consent",
        details: {
          missingOIDCScope: ["openid", "offline_access"],
          missingOIDCClaims: ["email"],
          missingResourceScopes,
        },
      },
      { accountId: userId },
      { userId, systemOwner: false },
      "existing-grant",
    );
    expect(response.statusCode).toBe(303);
    expect(grant.addOIDCScope).toHaveBeenCalledWith("openid offline_access");
    expect(grant.addOIDCClaims).toHaveBeenCalledWith(["email"]);
    expect(grant.addResourceScope).toHaveBeenCalledWith(resource, "brain:read");
    expect(interactionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { consent: { grantId: "grant-id" } },
      { mergeWithLastSubmission: true },
    );
  });
});

describe("OAuth favicon", () => {
  it("serves the brand favicon SVG and redirects favicon.ico", async () => {
    const app = Fastify();
    await registerOauthRoutes(
      app,
      {
        provider: {} as never,
        publicJwks: { keys: [] },
        issuer: "https://rementum.example.test/oauth",
        publicUrl: "https://rementum.example.test",
        workspaceResource: (id) => `https://rementum.example.test/mcp/workspace/${id}`,
      },
      {} as never,
      {} as never,
    );

    const svgResponse = await app.inject({ method: "GET", url: "/icon.svg" });
    expect(svgResponse.statusCode).toBe(200);
    expect(svgResponse.headers["content-type"]).toBe("image/svg+xml");
    expect(svgResponse.headers["cache-control"]).toBe("public, max-age=86400, immutable");
    expect(svgResponse.body).toContain("<svg");
    expect(svgResponse.body).toContain("rmTealTile");

    const icoResponse = await app.inject({ method: "GET", url: "/favicon.ico" });
    expect(icoResponse.statusCode).toBe(302);
    expect(icoResponse.headers.location).toBe("/icon.svg");

    await app.close();
  });
});

describe("workspace MCP resource parsing", () => {
  it("accepts only an exact workspace MCP resource on the public origin", () => {
    expect(
      workspaceIdFromResource(
        `https://rementum.example.test/mcp/workspace/${workspaceId}`,
        "https://rementum.example.test",
      ),
    ).toBe(workspaceId);
    expect(
      workspaceIdFromResource(
        `https://other.example.test/mcp/workspace/${workspaceId}`,
        "https://rementum.example.test",
      ),
    ).toBeNull();
    expect(
      workspaceIdFromResource(
        `https://rementum.example.test/mcp/workspace/${workspaceId}/extra`,
        "https://rementum.example.test",
      ),
    ).toBeNull();
  });
});
