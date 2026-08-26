import { randomUUID } from "node:crypto";
import { AuthRepository, type DatabaseClient, OidcPostgresAdapter } from "@rementum/db";
import type { FastifyInstance } from "fastify";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import Provider, { type Configuration, errors } from "oidc-provider";
import { z } from "zod";
import { allAccessScopes } from "./access.js";
import type { AppConfig } from "./config.js";
import type { VerifyCredentials } from "./credentials.js";

const workspaceMcpScopes = allAccessScopes.filter(
  (scope) => !scope.startsWith("team:") && !scope.startsWith("connection:"),
);

export interface OauthRuntime {
  provider: Provider;
  publicJwks: { keys: JWK[] };
  issuer: string;
  publicUrl: string;
  workspaceResource: (workspaceId: string) => string;
  allowSignup: boolean;
}

export async function buildOauthRuntime(
  config: AppConfig,
  database: DatabaseClient,
): Promise<OauthRuntime> {
  const issuer = `${config.REMENTUM_PUBLIC_URL.replace(/\/$/, "")}/oauth`;
  const publicUrl = config.REMENTUM_PUBLIC_URL.replace(/\/$/, "");
  const workspaceResource = (workspaceId: string) => `${publicUrl}/mcp/workspace/${workspaceId}`;
  const { privateJwks, publicJwks } = await resolveJwks(config.REMENTUM_JWT_JWKS);
  const auth = new AuthRepository(database);

  const configuration: Configuration = {
    adapter: (name) => new OidcPostgresAdapter(name, database.sql) as any,
    jwks: privateJwks as any,
    cookies: {
      keys: config.REMENTUM_COOKIE_KEYS.split(",").map((key) => key.trim()),
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
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, indicator) => {
          const workspaceId = workspaceIdFromResource(indicator, publicUrl);
          if (!workspaceId)
            throw new errors.InvalidTarget("Only workspace MCP resources are allowed");
          return {
            scope: ["openid", "profile", "email", "offline_access", ...workspaceMcpScopes].join(
              " ",
            ),
            audience: indicator,
            accessTokenTTL: 15 * 60,
            accessTokenFormat: "jwt",
          };
        },
      },
    },
    scopes: ["openid", "profile", "email", "offline_access", ...workspaceMcpScopes],
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
      RefreshToken: 60 * 24 * 60 * 60,
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
  return {
    provider,
    publicJwks,
    issuer,
    publicUrl,
    workspaceResource,
    allowSignup: config.REMENTUM_ALLOW_SIGNUP,
  };
}

export async function registerOauthRoutes(
  app: FastifyInstance,
  runtime: OauthRuntime,
  verifyCredentials: VerifyCredentials,
): Promise<void> {
  app.get("/oauth/interaction/:uid", async (request, reply) => {
    const details = await runtime.provider.interactionDetails(request.raw, reply.raw);
    const client = await runtime.provider.Client.find(String(details.params.client_id));
    const prompt = details.prompt.name;
    const action = `/oauth/interaction/${details.uid}/${prompt === "login" ? "login" : "confirm"}`;
    const body =
      prompt === "login"
        ? `<label>Email<input name="email" type="email" autocomplete="username" required></label>
         <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
         <div class="auth-links"><a href="${escapeHtml(`${runtime.publicUrl}/forgot-password`)}">Forgot password?</a>${runtime.allowSignup ? `<a href="${escapeHtml(`${runtime.publicUrl}/register`)}">Create account</a>` : ""}</div>`
        : `<p><strong>${escapeHtml(client?.clientName ?? String(details.params.client_id))}</strong> requests access to Rementum.</p>
         <p class="scope">${escapeHtml(String(details.params.scope ?? ""))}</p>`;
    return reply
      .type("text/html; charset=utf-8")
      .send(interactionPage(prompt, action, details.uid, body));
  });

  app.post("/oauth/interaction/:uid/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const user = await verifyCredentials(body.email ?? "", body.password ?? "");
    if (!user) {
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
    if (!user.emailVerifiedAt) {
      return reply
        .code(403)
        .type("text/html")
        .send(
          interactionPage(
            "login",
            `/oauth/interaction/${request.params && (request.params as any).uid}/login`,
            String((request.params as any).uid),
            `<p class="error">Verify your email before signing in.</p>
           <label>Email<input name="email" type="email" value="${escapeHtml(user.email)}" required></label>
           <label>Password<input name="password" type="password" required></label>
           <div class="auth-links"><a href="${escapeHtml(`${runtime.publicUrl}/resend-verification`)}">Resend verification</a></div>`,
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

  app.get("/.well-known/oauth-protected-resource/mcp/workspace/:workspaceId", async (request) => {
    const { workspaceId } = z.object({ workspaceId: z.uuid() }).parse(request.params);
    return {
      resource: runtime.workspaceResource(workspaceId),
      authorization_servers: [runtime.issuer],
      scopes_supported: workspaceMcpScopes,
      bearer_methods_supported: ["header"],
    };
  });
  app.get("/.well-known/jwks.json", async () => runtime.publicJwks);
}

export function workspaceIdFromResource(resource: string, publicUrl: string): string | null {
  const prefix = `${publicUrl.replace(/\/$/, "")}/mcp/workspace/`;
  if (!resource.startsWith(prefix)) return null;
  const candidate = resource.slice(prefix.length);
  return z.uuid().safeParse(candidate).success ? candidate : null;
}

async function resolveJwks(serialized: string | undefined) {
  if (serialized) {
    const parsed = JSON.parse(serialized) as { keys: JWK[] };
    if (!Array.isArray(parsed.keys) || !parsed.keys.length)
      throw new Error("REMENTUM_JWT_JWKS has no keys");
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
  <title>Rementum | ${escapeHtml(prompt)}</title><style>
  :root{color-scheme:light dark;--canvas:#0f1714;--surface:#17211e;--raised:#1c2924;--field:#111a16;--text:#f3f5f1;--muted:#bdcbc5;--quiet:#8fa099;--line:rgb(243 245 241 / 12%);--danger:#e2b6b6;--danger-bg:rgb(226 182 182 / 10%);--danger-line:rgb(226 182 182 / 25%);--accent:#2f8a70;--accent-hover:#37a183;--accent-ink:#f3f5f1;--ring:rgb(47 138 112 / 25%);--glow:0 0 24px rgb(47 138 112 / 30%)}
  @media(prefers-color-scheme:light){:root{--canvas:#f3f5f1;--surface:#ffffff;--raised:#e9efe9;--field:#ffffff;--text:#17211e;--muted:#43544d;--quiet:#64756d;--line:rgb(23 33 30 / 12%);--danger:#a03d3d;--danger-bg:rgb(160 61 61 / 8%);--danger-line:rgb(160 61 61 / 25%);--accent:#2f6f5e;--accent-hover:#255849;--ring:rgb(47 111 94 / 20%);--glow:0 0 24px rgb(47 111 94 / 16%)}}
  *{box-sizing:border-box}body{min-width:320px;min-height:100dvh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 15%,rgb(47 138 112 / 8%),transparent 40%),var(--canvas);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
  main{width:min(430px,100%);padding:26px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:inset 0 1px 0 rgb(255 255 255 / 4%),0 28px 90px rgb(0 0 0 / 32%)}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:34px;color:var(--muted);font-size:13px;font-weight:650}.mark{display:block;width:28px;height:28px;flex:0 0 28px;color:var(--text)}
  h1{margin:0;color:var(--text);font-size:30px;font-weight:620;letter-spacing:-.04em;line-height:1.1}.intro{margin:10px 0 24px;color:var(--muted)}
  label{display:grid;gap:7px;margin:16px 0;color:var(--muted);font-size:12px;font-weight:600}input{min-height:43px;padding:0 11px;border:1px solid var(--line);border-radius:8px;outline:0;background:var(--field);color:var(--text);font:14px ui-sans-serif,system-ui,sans-serif;transition:border-color .15s ease,background .15s ease,box-shadow .15s ease}input:focus{border-color:var(--accent);background:var(--raised);box-shadow:0 0 0 3px var(--ring)}
  button{width:100%;min-height:43px;margin-top:8px;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:var(--accent-ink);cursor:pointer;font:650 13px/1 ui-sans-serif,system-ui,sans-serif;transition:background .15s ease,border-color .15s ease,transform .15s ease}button:hover{border-color:var(--accent-hover);background:var(--accent-hover)}button:active{transform:scale(.985)}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.deny{margin-top:8px;border-color:transparent;background:transparent;color:var(--muted);box-shadow:none}.deny:hover{border-color:var(--line);background:var(--raised);color:var(--text)}
  .scope{overflow-wrap:anywhere;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--quiet);font:11px/1.7 ui-monospace,monospace}.error{padding:10px 12px;border:1px solid var(--danger-line);border-radius:8px;background:var(--danger-bg);color:var(--danger);font-size:12px}.auth-links{display:flex;justify-content:space-between;gap:16px;margin:2px 0 16px}.auth-links a{color:var(--muted);font-size:12px;text-decoration:none}.auth-links a:hover{color:var(--text)}.foot{margin:22px 0 0;color:var(--quiet);font:10px/1.5 ui-monospace,monospace;text-align:center}
  @media(max-width:480px){body{align-items:start;padding:16px}main{margin-top:8vh;padding:21px}.brand{margin-bottom:28px}}
  @media(prefers-reduced-motion:reduce){*{transition-duration:.01ms}}
  </style></head><body><main><div class="brand"><svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M6 4h11.2C23.8 4 28 7.8 28 13.4s-4.2 9.4-10.8 9.4H12V28H6V4Zm6 5.2v8.4h5.2c3.1 0 4.8-1.5 4.8-4.2s-1.7-4.2-4.8-4.2H12Z"/><path fill="#79aa98" d="M14.2 20.6h5.7L28 28h-6.5l-7.3-7.4Z"/></svg><span>Rementum</span></div><h1>${prompt === "login" ? "Sign in" : "Approve connection"}</h1>
  <p class="intro">${prompt === "login" ? "Open your local knowledge workspace." : "Review what this client can access."}</p>
  <form method="post" action="${escapeHtml(action)}"><input type="hidden" name="uid" value="${escapeHtml(uid)}">${body}<button type="submit">${prompt === "login" ? "Continue" : "Approve"}</button></form>
  ${prompt === "consent" ? `<form method="post" action="/oauth/interaction/${escapeHtml(uid)}/abort"><button class="deny" type="submit">Deny</button></form>` : ""}
  <p class="foot">Authorization stays on this Rementum instance.</p></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
