import { createHash, randomBytes } from "node:crypto";
import { AuthRepository, createDatabaseClient } from "@rementum/db";
import { hash } from "argon2";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { createLocalJWKSet, jwtVerify } from "jose";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

const host = "rementum.example.test";
const publicUrl = `http://${host}`;
const redirectUri = "cursor://anysphere.cursor-mcp/oauth/callback";
const cursorRedirectUris = [
  redirectUri,
  "https://www.cursor.com/agents/mcp/oauth/callback",
  "http://localhost:8787/callback",
];
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

/** One API instance plus a browser-like visitor that carries cookies across the redirect chain. */
async function startApp(suffix: string) {
  if (!databaseUrl) throw new Error("REMENTUM_TEST_DATABASE_URL is required");
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
  const webSignIn = async (email: string, password: string): Promise<LightMyRequestResponse> => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/session",
      headers: {
        host,
        origin: publicUrl,
        ...(jar.header ? { cookie: jar.header } : {}),
      },
      payload: { email, password },
    });
    jar.absorb(response);
    return response;
  };
  return { app, database, auth, visit, webSignIn };
}

function tokenRequest(app: FastifyInstance, fields: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: "/oauth/token",
    headers: {
      host,
      "x-forwarded-proto": "http",
      "content-type": "application/x-www-form-urlencoded",
    },
    payload: new URLSearchParams(fields).toString(),
  });
}

async function submitAutoForm(
  visit: (
    method: "GET" | "POST",
    url: string,
    payload?: Record<string, string>,
  ) => Promise<LightMyRequestResponse>,
  response: LightMyRequestResponse,
): Promise<LightMyRequestResponse> {
  const action = response.body.match(/<form[^>]+action="([^"]+)"/)?.[1];
  if (!action) throw new Error("Automatic OAuth form has no action");
  const fields = Object.fromEntries(
    [...response.body.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g)].map(
      ([, name, value]) => [name as string, value as string],
    ),
  );
  return visit("POST", action.replaceAll("&amp;", "&"), fields);
}

integration("OAuth authorization code flow", () => {
  it("issues a workspace-audience token an MCP client can use", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const { app, database, auth, visit, webSignIn } = await startApp(suffix);

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
      const verification = randomBytes(24).toString("hex");
      await auth.createAuthToken(
        account.user.id,
        "verify_email",
        verification,
        new Date(Date.now() + 60_000),
      );
      expect(await auth.verifyEmail(verification)).toBe(true);
      expect((await webSignIn(email, password)).statusCode).toBe(204);

      const registration = await app.inject({
        method: "POST",
        url: "/oauth/reg",
        headers: { host, "x-forwarded-proto": "http", "content-type": "application/json" },
        payload: {
          client_name: "Test agent",
          redirect_uris: cursorRedirectUris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      });
      expect(registration.statusCode).toBe(201);
      expect(registration.json().application_type).toBe("native");
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

      const loggedIn = await visit("GET", interaction);
      expect(loggedIn.statusCode).toBe(303);
      const resumed = await visit("GET", String(loggedIn.headers.location));
      expect(resumed.statusCode).toBe(303);

      const consented = await visit("GET", String(resumed.headers.location));
      expect(consented.statusCode).toBe(303);
      const issued = await visit("GET", String(consented.headers.location));
      expect(issued.statusCode).toBe(303);
      const callback = new URL(String(issued.headers.location));
      expect(`${callback.protocol}//${callback.host}${callback.pathname}`).toBe(redirectUri);
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

      // A later web login is authoritative even while oidc-provider still remembers the first
      // account. Its supported account-switch path clears that OAuth session before continuing.
      const secondEmail = `oauth-second-${suffix}@example.test`;
      const second = await auth.registerAccount(
        secondEmail,
        "Second OAuth owner",
        await hash(password),
        "Second OAuth team",
        `oauth-second-${suffix}`,
      );
      if (!second) throw new Error("Second registration failed");
      const secondVerification = randomBytes(24).toString("hex");
      await auth.createAuthToken(
        second.user.id,
        "verify_email",
        secondVerification,
        new Date(Date.now() + 60_000),
      );
      expect(await auth.verifyEmail(secondVerification)).toBe(true);
      expect((await webSignIn(secondEmail, password)).statusCode).toBe(204);

      const secondPkce = pkce();
      const secondResource = `${publicUrl}/mcp/workspace/${second.workspaceId}`;
      const secondAuthorize = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "openid offline_access brain:read",
        resource: secondResource,
        state: `state-second-${suffix}`,
        code_challenge: secondPkce.challenge,
        code_challenge_method: "S256",
      });
      const switchStarted = await visit("GET", `/oauth/auth?${secondAuthorize.toString()}`);
      expect(switchStarted.statusCode).toBe(303);
      const switchSubmitted = await visit("GET", String(switchStarted.headers.location));
      expect(switchSubmitted.statusCode).toBe(303);
      const switchResume = await visit("GET", String(switchSubmitted.headers.location));
      expect(switchResume.statusCode).toBe(200);
      const oldSessionEnded = await submitAutoForm(visit, switchResume);
      expect(oldSessionEnded.statusCode).toBe(303);
      const switchLoggedIn = await visit("GET", String(oldSessionEnded.headers.location));
      expect(switchLoggedIn.statusCode).toBe(303);
      const switchConsented = await visit("GET", String(switchLoggedIn.headers.location));
      expect(switchConsented.statusCode).toBe(303);
      const switchIssued = await visit("GET", String(switchConsented.headers.location));
      expect(switchIssued.statusCode).toBe(303);
      const secondCallback = new URL(String(switchIssued.headers.location));
      expect(secondCallback.searchParams.get("state")).toBe(`state-second-${suffix}`);
      const secondToken = await tokenRequest(app, {
        grant_type: "authorization_code",
        code: secondCallback.searchParams.get("code") ?? "",
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: secondPkce.verifier,
        resource: secondResource,
      });
      expect(secondToken.statusCode).toBe(200);
      const secondPayload = await jwtVerify(
        secondToken.json().access_token,
        createLocalJWKSet(jwks.json()),
        { issuer: `${publicUrl}/oauth`, audience: secondResource },
      );
      expect(secondPayload.payload.sub).toBe(second.user.id);
    } finally {
      await database.close();
      await app.close();
    }
  }, 120_000);

  it("refuses silent authorization when the web account cannot access the workspace", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const { app, database, auth, visit, webSignIn } = await startApp(suffix);

    try {
      const owner = await auth.registerAccount(
        `owner-${suffix}@example.test`,
        "Workspace owner",
        await hash(password),
        "Owner team",
        `owner-${suffix}`,
      );
      const strangerEmail = `stranger-${suffix}@example.test`;
      const stranger = await auth.registerAccount(
        strangerEmail,
        "Stranger",
        await hash(password),
        "Stranger team",
        `stranger-${suffix}`,
      );
      if (!owner || !stranger) throw new Error("Registration failed");
      const verification = randomBytes(24).toString("hex");
      await auth.createAuthToken(
        stranger.user.id,
        "verify_email",
        verification,
        new Date(Date.now() + 60_000),
      );
      expect(await auth.verifyEmail(verification)).toBe(true);
      expect((await webSignIn(strangerEmail, password)).statusCode).toBe(204);

      const registration = await app.inject({
        method: "POST",
        url: "/oauth/reg",
        headers: { host, "x-forwarded-proto": "http", "content-type": "application/json" },
        payload: {
          client_name: "Untrusted workspace probe",
          redirect_uris: cursorRedirectUris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      });
      expect(registration.statusCode).toBe(201);
      const { challenge } = pkce();
      const authorize = new URLSearchParams({
        client_id: registration.json().client_id,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "openid offline_access brain:read",
        resource: `${publicUrl}/mcp/workspace/${owner.workspaceId}`,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      const started = await visit("GET", `/oauth/auth?${authorize.toString()}`);
      expect(started.statusCode).toBe(303);
      const refused = await visit("GET", String(started.headers.location));
      expect(refused.statusCode).toBe(403);
      expect(refused.json()).toMatchObject({ code: "forbidden" });

      const [grants] = await database.sql<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM oauth_records
        WHERE model = 'Grant' AND payload->>'accountId' = ${stranger.user.id}
      `;
      expect(grants?.count).toBe(0);
    } finally {
      await database.close();
      await app.close();
    }
  }, 120_000);

  it("accepts a client identified by its metadata document without registering it", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const clientId = "https://client.example.test/oauth/client-metadata.json";
    const impostorId = "https://client.example.test/oauth/impostor.json";
    const loopbackRedirect = "http://localhost:3118/callback";
    const document = {
      client_id: clientId,
      client_name: "Metadata client",
      redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
    const fetched: string[] = [];
    // The provider reads the document through the global fetch. The stub stands in for the
    // client's web host, serves the same document under both ids, and refuses everything else so
    // the test never reaches the network.
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      fetched.push(url);
      if (url !== clientId && url !== impostorId) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(document), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
      });
    });
    const { app, database, auth, visit, webSignIn } = await startApp(suffix);

    try {
      const email = `cimd-${suffix}@example.test`;
      const account = await auth.registerAccount(
        email,
        "CIMD owner",
        await hash(password),
        "CIMD team",
        `cimd-${suffix}`,
      );
      if (!account) throw new Error("Registration failed");
      const verification = randomBytes(24).toString("hex");
      await auth.createAuthToken(
        account.user.id,
        "verify_email",
        verification,
        new Date(Date.now() + 60_000),
      );
      expect(await auth.verifyEmail(verification)).toBe(true);
      expect((await webSignIn(email, password)).statusCode).toBe(204);

      const resource = `${publicUrl}/mcp/workspace/${account.workspaceId}`;
      const { verifier, challenge } = pkce();
      const authorize = (overrides: Record<string, string>) =>
        new URLSearchParams({
          client_id: clientId,
          response_type: "code",
          redirect_uri: loopbackRedirect,
          scope: "openid offline_access brain:read",
          resource,
          state: `state-${suffix}`,
          code_challenge: challenge,
          code_challenge_method: "S256",
          ...overrides,
        }).toString();

      // A document is only a client for the URL it names itself by.
      const impostor = await visit("GET", `/oauth/auth?${authorize({ client_id: impostorId })}`);
      expect(impostor.statusCode).toBe(400);
      expect(impostor.body).toContain("invalid_client_metadata");

      // Loopback callbacks match with the port ignored; anything else must be listed exactly.
      const foreign = await visit(
        "GET",
        `/oauth/auth?${authorize({ redirect_uri: "https://attacker.example.test/callback" })}`,
      );
      expect(foreign.statusCode).toBe(400);
      expect(foreign.body).toContain("invalid_redirect_uri");

      const started = await visit("GET", `/oauth/auth?${authorize({})}`);
      expect(started.statusCode).toBe(303);
      const interaction = String(started.headers.location);

      const loggedIn = await visit("GET", interaction);
      expect(loggedIn.statusCode).toBe(303);
      const resumed = await visit("GET", String(loggedIn.headers.location));
      expect(resumed.statusCode).toBe(303);

      const consented = await visit("GET", String(resumed.headers.location));
      expect(consented.statusCode).toBe(303);
      const issued = await visit("GET", String(consented.headers.location));
      expect(issued.statusCode).toBe(303);
      const callback = new URL(String(issued.headers.location));
      expect(`${callback.origin}${callback.pathname}`).toBe(loopbackRedirect);
      const code = callback.searchParams.get("code");
      expect(code).toBeTruthy();

      const token = await tokenRequest(app, {
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: loopbackRedirect,
        client_id: clientId,
        code_verifier: verifier,
        resource,
      });
      expect(token.statusCode).toBe(200);
      const grant = token.json();
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
      expect(payload.client_id).toBe(clientId);
      await expectMcpInitialized(app, account.workspaceId, grant.access_token);

      // The document was fetched once and then served from cache; nothing was registered.
      expect(fetched.filter((url) => url === clientId)).toHaveLength(1);
      const [stored] = await database.sql<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM oauth_records WHERE model = 'Client' AND id = ${clientId}
      `;
      expect(stored?.count).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      await database.close();
      await app.close();
    }
  }, 120_000);
});

/**
 * Lists tools over the modern stateless protocol. The legacy initialize path hands the request to
 * hono's listener, which schedules a socket drain that the injected mock socket cannot serve; with
 * more than one flow in this file that timer fires mid-run as an unhandled error.
 */
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
      accept: "application/json",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/list",
      authorization: `Bearer ${accessToken}`,
    },
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    },
  });
  expect(response.statusCode).toBe(200);
  const names = response.json().result.tools.map((tool: { name: string }) => tool.name);
  expect(names).toContain("list_brains");
}
