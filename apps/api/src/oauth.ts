import { randomUUID } from "node:crypto";
import { AuthRepository, type DatabaseClient, OidcPostgresAdapter } from "@owl-memory/db";
import { verify } from "argon2";
import type { FastifyInstance } from "fastify";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import Provider, { type Configuration } from "oidc-provider";
import type { AppConfig } from "./config.js";

export interface OauthRuntime {
  provider: Provider;
  publicJwks: { keys: JWK[] };
  issuer: string;
  resource: string;
}

export async function buildOauthRuntime(
  config: AppConfig,
  database: DatabaseClient,
): Promise<OauthRuntime> {
  const issuer = `${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/oauth`;
  const resource = `${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/mcp`;
  const { privateJwks, publicJwks } = await resolveJwks(config.OWL_JWT_JWKS);
  const auth = new AuthRepository(database);

  const configuration: Configuration = {
    adapter: (name) => new OidcPostgresAdapter(name, database.sql) as any,
    jwks: privateJwks as any,
    clients: [
      {
        client_id: "owl-web",
        client_name: "Owl Memory Web",
        redirect_uris: [`${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/auth/callback`],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        application_type: "web",
      },
    ],
    cookies: {
      keys: config.OWL_COOKIE_KEYS.split(",").map((key) => key.trim()),
      long: {
        signed: true,
        httpOnly: true,
        sameSite: "lax",
        secure: config.NODE_ENV === "production",
      },
      short: {
        signed: true,
        httpOnly: true,
        sameSite: "lax",
        secure: config.NODE_ENV === "production",
      },
    },
    features: {
      devInteractions: { enabled: false },
      registration: {
        enabled: true,
      },
      registrationManagement: { enabled: true, rotateRegistrationAccessToken: true },
      revocation: { enabled: true },
      introspection: { enabled: true },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => resource,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, indicator) => {
          if (
            indicator !== resource &&
            indicator !== `${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/api`
          ) {
            throw new Error("invalid_target");
          }
          return {
            scope:
              "openid profile email offline_access brain:read brain:write task:read task:write",
            audience: indicator,
            accessTokenTTL: 15 * 60,
            accessTokenFormat: "jwt",
          };
        },
      },
    },
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "brain:read",
      "brain:write",
      "task:read",
      "task:write",
    ],
    responseTypes: ["code"],
    claims: {
      openid: ["sub"],
      profile: ["name"],
      email: ["email", "email_verified"],
    },
    pkce: { required: () => true },
    rotateRefreshToken: true,
    issueRefreshToken: (_ctx, client) => client.grantTypeAllowed("refresh_token"),
    ttl: {
      AccessToken: 15 * 60,
      AuthorizationCode: 60,
      Interaction: 15 * 60,
      Session: 14 * 24 * 60 * 60,
      RefreshToken: 30 * 24 * 60 * 60,
    },
    interactions: {
      url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx, id) => {
      const user = await auth.findUserById(id);
      if (!user) return undefined;
      return {
        accountId: user.id,
        claims: async () => ({
          sub: user.id,
          name: user.displayName,
          email: user.email,
          email_verified: true,
        }),
      };
    },
  };

  const provider = new Provider(issuer, configuration);
  provider.proxy = true;
  provider.on("server_error", (_ctx, error) => {
    console.error("OAuth provider error", error);
  });
  return { provider, publicJwks, issuer, resource };
}

export async function registerOauthRoutes(
  app: FastifyInstance,
  runtime: OauthRuntime,
  auth: AuthRepository,
): Promise<void> {
  app.get("/oauth/interaction/:uid", async (request, reply) => {
    const details = await runtime.provider.interactionDetails(request.raw, reply.raw);
    const client = await runtime.provider.Client.find(String(details.params.client_id));
    const prompt = details.prompt.name;
    const action = `/oauth/interaction/${details.uid}/${prompt === "login" ? "login" : "confirm"}`;
    const body =
      prompt === "login"
        ? `<label>Email<input name="email" type="email" autocomplete="username" required></label>
         <label>Password<input name="password" type="password" autocomplete="current-password" required></label>`
        : `<p><strong>${escapeHtml(client?.clientName ?? String(details.params.client_id))}</strong> requests access to Owl Memory.</p>
         <p class="scope">${escapeHtml(String(details.params.scope ?? ""))}</p>`;
    return reply
      .type("text/html; charset=utf-8")
      .send(interactionPage(prompt, action, details.uid, body));
  });

  app.post("/oauth/interaction/:uid/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const user = body.email ? await auth.findUserByEmail(body.email) : null;
    if (!user || !body.password || !(await verify(user.passwordHash, body.password))) {
      return reply
        .code(401)
        .type("text/html")
        .send(
          interactionPage(
            "login",
            `/oauth/interaction/${request.params && (request.params as any).uid}/login`,
            String((request.params as any).uid),
            `<p class="error">Invalid email or password.</p>
           <label>Email<input name="email" type="email" required></label>
           <label>Password<input name="password" type="password" required></label>`,
          ),
        );
    }
    await runtime.provider.interactionFinished(
      request.raw,
      reply.raw,
      { login: { accountId: user.id, amr: ["pwd"] } },
      { mergeWithLastSubmission: false },
    );
    reply.hijack();
  });

  app.post("/oauth/interaction/:uid/confirm", async (request, reply) => {
    const details = await runtime.provider.interactionDetails(request.raw, reply.raw);
    const { prompt, grantId, session, params } = details;
    if (prompt.name !== "consent" || !session?.accountId)
      return reply.code(400).send("Invalid consent state");
    let grant = grantId ? await runtime.provider.Grant.find(grantId) : undefined;
    grant ??= new runtime.provider.Grant({
      accountId: session.accountId,
      clientId: String(params.client_id),
    });
    const missing = prompt.details as {
      missingOIDCScope?: string[];
      missingOIDCClaims?: string[];
      missingResourceScopes?: Record<string, string[]>;
    };
    if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(" "));
    if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims);
    for (const [indicator, scopes] of Object.entries(missing.missingResourceScopes ?? {})) {
      grant.addResourceScope(indicator, scopes.join(" "));
    }
    await runtime.provider.interactionFinished(
      request.raw,
      reply.raw,
      { consent: { grantId: await grant.save() } },
      { mergeWithLastSubmission: true },
    );
    reply.hijack();
  });

  app.post("/oauth/interaction/:uid/abort", async (request, reply) => {
    await runtime.provider.interactionFinished(
      request.raw,
      reply.raw,
      { error: "access_denied", error_description: "The user denied access" },
      { mergeWithLastSubmission: false },
    );
    reply.hijack();
  });

  app.get("/.well-known/oauth-protected-resource", async () => ({
    resource: runtime.resource,
    authorization_servers: [runtime.issuer],
    scopes_supported: ["brain:read", "brain:write", "task:read", "task:write"],
    bearer_methods_supported: ["header"],
  }));
  app.get("/.well-known/oauth-protected-resource/mcp", async () => ({
    resource: runtime.resource,
    authorization_servers: [runtime.issuer],
    scopes_supported: ["brain:read", "brain:write", "task:read", "task:write"],
    bearer_methods_supported: ["header"],
  }));
  app.get("/.well-known/jwks.json", async () => runtime.publicJwks);
}

async function resolveJwks(serialized: string | undefined) {
  if (serialized) {
    const parsed = JSON.parse(serialized) as { keys: JWK[] };
    if (!Array.isArray(parsed.keys) || !parsed.keys.length)
      throw new Error("OWL_JWT_JWKS has no keys");
    return {
      privateJwks: parsed,
      publicJwks: {
        keys: parsed.keys.map(({ d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...key }) => key),
      },
    };
  }
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });
  const kid = randomUUID();
  const privateJwk = { ...(await exportJWK(privateKey)), use: "sig", alg: "RS256", kid };
  const publicJwk = { ...(await exportJWK(publicKey)), use: "sig", alg: "RS256", kid };
  return { privateJwks: { keys: [privateJwk] }, publicJwks: { keys: [publicJwk] } };
}

function interactionPage(prompt: string, action: string, uid: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Owl Memory · ${escapeHtml(prompt)}</title><style>
  :root{color-scheme:light}body{font:16px/1.5 ui-sans-serif,system-ui;background:#f4f1e9;color:#17211d;margin:0;display:grid;min-height:100vh;place-items:center}
  main{width:min(420px,calc(100vw - 48px));background:#fff;border:1px solid #d7d2c7;padding:32px;box-shadow:0 18px 60px #17211d18}
  h1{font:600 30px/1.1 ui-serif,Georgia;margin:0 0 24px}.mark{font:700 12px/1 ui-monospace;color:#a4472c;letter-spacing:.14em;text-transform:uppercase}
  label{display:grid;gap:6px;margin:16px 0;font-weight:600}input{font:inherit;padding:11px;border:1px solid #aaa69d;border-radius:4px}
  button{font:700 14px/1 ui-sans-serif;padding:12px 16px;border:0;background:#17211d;color:#fff;cursor:pointer;width:100%}.deny{background:transparent;color:#6e3425;margin-top:8px}
  .scope{font-family:ui-monospace,monospace;font-size:12px;background:#f4f1e9;padding:12px}.error{color:#9b2c20}
  </style></head><body><main><p class="mark">Owl Memory</p><h1>${prompt === "login" ? "Sign in" : "Approve connection"}</h1>
  <form method="post" action="${escapeHtml(action)}"><input type="hidden" name="uid" value="${escapeHtml(uid)}">${body}<button type="submit">${prompt === "login" ? "Continue" : "Approve"}</button></form>
  ${prompt === "consent" ? `<form method="post" action="/oauth/interaction/${escapeHtml(uid)}/abort"><button class="deny" type="submit">Deny</button></form>` : ""}
  </main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
