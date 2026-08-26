import { createHash, randomBytes } from "node:crypto";
import { AuthRepository, createDatabaseClient } from "@rementum/db";
import { hash } from "argon2";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { createLocalJWKSet, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

const host = "rementum.example.test";
const publicUrl = `http://${host}`;
const redirectUri = "http://client.example.test/callback";
const password = "correct horse battery staple";

/** Accumulates Set-Cookie across a redirect chain the way a browser would. */
class CookieJar {
  private readonly jar = new Map<string, string>();

  absorb(response: LightMyRequestResponse): void {
    const header = response.headers["set-cookie"];
    for (const entry of Array.isArray(header) ? header : header ? [header] : []) {
      const [pair] = entry.split(";", 1);
      const separator = pair?.indexOf("=") ?? -1;
      if (!pair || separator < 1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.jar.set(name, value);
      else this.jar.delete(name);
    }
  }

  get header(): string {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

integration("OAuth authorization code flow", () => {
  it("issues a workspace-audience token an MCP client can use", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const config = loadConfig({
      NODE_ENV: "test",
      REMENTUM_PUBLIC_URL: publicUrl,
      REMENTUM_DATABASE_URL: databaseUrl,
      REMENTUM_MASTER_KEY: Buffer.alloc(32, 9).toString("base64"),
      REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
      REMENTUM_BLOB_DIR: `/tmp/rementum-${suffix}/blobs`,
      REMENTUM_EXPORT_DIR: `/tmp/rementum-${suffix}/exports`,
      REMENTUM_EMBEDDINGS_URL: "http://127.0.0.1:9",
      REMENTUM_LOG_LEVEL: "silent",
    });
    const app = await buildApp(config, { mailer: null });
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const jar = new CookieJar();
    const visit = async (
      method: "GET" | "POST",
      url: string,
      payload?: Record<string, string>,
    ): Promise<LightMyRequestResponse> => {
      const response = await app.inject({
        method,
        url,
        headers: {
          host,
          "x-forwarded-proto": "http",
          ...(jar.header ? { cookie: jar.header } : {}),
          ...(payload ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        ...(payload ? { payload: new URLSearchParams(payload).toString() } : {}),
      });
      jar.absorb(response);
      return response;
    };

    try {
      const email = `oauth-${suffix}@example.test`;
      const account = await auth.registerAccount(
        email,
        "OAuth owner",
        await hash(password),
        "OAuth team",
        `oauth-${suffix}`,
      );
      if (!account) throw new Error("Registration failed");

      const registration = await app.inject({
        method: "POST",
        url: "/oauth/reg",
        headers: { host, "x-forwarded-proto": "http", "content-type": "application/json" },
        payload: {
          client_name: "Test agent",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      });
      expect(registration.statusCode).toBe(201);
      const clientId = registration.json().client_id;

      const resource = `${publicUrl}/mcp/workspace/${account.workspaceId}`;
      const { verifier, challenge } = pkce();
      const authorize = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "openid offline_access brain:read",
        resource,
        state: `state-${suffix}`,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      const started = await visit("GET", `/oauth/auth?${authorize.toString()}`);
      expect(started.statusCode).toBe(303);
      const interaction = String(started.headers.location);
      expect(interaction).toMatch(/^\/oauth\/interaction\//);
      const uid = interaction.split("/").pop() as string;

      const loginPage = await visit("GET", interaction);
      expect(loginPage.statusCode).toBe(200);
      expect(loginPage.headers["content-security-policy"]).toContain("default-src 'none'");
      expect(loginPage.headers["referrer-policy"]).toBe("no-referrer");
      expect(loginPage.body).toContain(`action="/oauth/interaction/${uid}/login"`);
      expect(loginPage.body).toContain("Sign in");

      const wrongPassword = await visit("POST", `${interaction}/login`, {
        uid,
        email,
        password: "not the password",
      });
      expect(wrongPassword.statusCode).toBe(401);
      expect(wrongPassword.body).toContain("Invalid email or password.");

      const unverified = await visit("POST", `${interaction}/login`, { uid, email, password });
      expect(unverified.statusCode).toBe(403);
      expect(unverified.body).toContain("Verify your email before signing in.");

      const verification = randomBytes(24).toString("hex");
      await auth.createAuthToken(
        account.user.id,
        "verify_email",
        verification,
        new Date(Date.now() + 60_000),
      );
      expect(await auth.verifyEmail(verification)).toBe(true);

      const loggedIn = await visit("POST", `${interaction}/login`, { uid, email, password });
      expect(loggedIn.statusCode).toBe(303);
      const resumed = await visit("GET", String(loggedIn.headers.location));
      expect(resumed.statusCode).toBe(303);

      const consentPage = await visit("GET", String(resumed.headers.location));
      expect(consentPage.statusCode).toBe(200);
      expect(consentPage.body).toContain("Approve connection");
      expect(consentPage.body).toContain("Test agent");
      expect(consentPage.body).toContain("brain:read");

      const consentUid = String(resumed.headers.location).split("/").pop() as string;
      const confirmed = await visit("POST", `/oauth/interaction/${consentUid}/confirm`, {
        uid: consentUid,
      });
      expect(confirmed.statusCode).toBe(303);

      const issued = await visit("GET", String(confirmed.headers.location));
      expect(issued.statusCode).toBe(303);
      const callback = new URL(String(issued.headers.location));
      expect(callback.origin + callback.pathname).toBe(redirectUri);
      expect(callback.searchParams.get("state")).toBe(`state-${suffix}`);
      const code = callback.searchParams.get("code");
      expect(code).toBeTruthy();

      const token = await app.inject({
        method: "POST",
        url: "/oauth/token",
        headers: {
          host,
          "x-forwarded-proto": "http",
          "content-type": "application/x-www-form-urlencoded",
        },
        payload: new URLSearchParams({
          grant_type: "authorization_code",
          code: code ?? "",
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
          resource,
        }).toString(),
      });
      expect(token.statusCode).toBe(200);
      const grant = token.json();
      expect(grant.token_type).toBe("Bearer");
      expect(grant.refresh_token).toBeTruthy();

      const jwks = await app.inject({
        method: "GET",
        url: "/.well-known/jwks.json",
        headers: { host },
      });
      const { payload } = await jwtVerify(grant.access_token, createLocalJWKSet(jwks.json()), {
        issuer: `${publicUrl}/oauth`,
        audience: resource,
      });
      expect(payload.sub).toBe(account.user.id);
      expect(String(payload.scope).split(" ")).toContain("brain:read");

      // The same code cannot be exchanged a second time.
      const replay = await app.inject({
        method: "POST",
        url: "/oauth/token",
        headers: {
          host,
          "x-forwarded-proto": "http",
          "content-type": "application/x-www-form-urlencoded",
        },
        payload: new URLSearchParams({
          grant_type: "authorization_code",
          code: code ?? "",
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
          resource,
        }).toString(),
      });
      expect(replay.statusCode).toBe(400);

      const metadata = await app.inject({
        method: "GET",
        url: `/.well-known/oauth-protected-resource/mcp/workspace/${account.workspaceId}`,
        headers: { host },
      });
      expect(metadata.json()).toMatchObject({
        resource,
        authorization_servers: [`${publicUrl}/oauth`],
        bearer_methods_supported: ["header"],
      });

      await expectMcpInitialized(app, account.workspaceId, grant.access_token);

      // A token minted for this workspace is not accepted at another workspace's endpoint.
      const otherWorkspace = "00000000-0000-4000-8000-0000000000ff";
      const wrongAudience = await app.inject({
        method: "POST",
        url: `/mcp/workspace/${otherWorkspace}`,
        headers: {
          host,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${grant.access_token}`,
        },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
      expect(wrongAudience.statusCode).toBe(401);
      expect(String(wrongAudience.headers["www-authenticate"])).toContain(
        `/.well-known/oauth-protected-resource/mcp/workspace/${otherWorkspace}`,
      );
    } finally {
      await database.close();
      await app.close();
    }
  }, 120_000);
});

async function expectMcpInitialized(
  app: FastifyInstance,
  workspaceId: string,
  accessToken: string,
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: `/mcp/workspace/${workspaceId}`,
    headers: {
      host,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${accessToken}`,
    },
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "integration-test", version: "1.0.0" },
      },
    },
  });
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("rementum");
}
