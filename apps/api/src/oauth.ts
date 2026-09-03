import { randomUUID } from "node:crypto";
import { AuthRepository, type DatabaseClient, OidcPostgresAdapter } from "@rementum/db";
import type { FastifyInstance, FastifyReply } from "fastify";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import Provider, { type Configuration, errors } from "oidc-provider";
import { z } from "zod";
import { allAccessScopes } from "./access.js";
import type { AppConfig } from "./config.js";
import type { VerifyCredentials } from "./credentials.js";

const workspaceMcpScopes = allAccessScopes.filter(
  (scope) => !scope.startsWith("team:") && !scope.startsWith("connection:"),
);

// Claude uses the metadata document Anthropic hosts on claude.ai as its client id once discovery
// advertises this feature, so no client is registered or stored for it. The ack pins the draft
// oidc-provider implements; a provider upgrade to a later draft then fails at startup instead of
// silently changing what a document may contain. @types/oidc-provider 8 predates the feature, so
// the entry is spread into the features object rather than written where the type would reject it.
const clientIdMetadataDocument = {
  clientIdMetadataDocument: { enabled: true, ack: "draft-02" },
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
    clientDefaults: {
      // MCP clients are installed/native applications. Cursor registers its custom-scheme,
      // hosted, and loopback callbacks together and relies on PKCE instead of a client secret.
      // The default also covers metadata documents that omit application_type: Claude Code's
      // lists loopback callbacks without a port, which only a native client may match.
      application_type: "native",
    },
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
      ...clientIdMetadataDocument,
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
          email_verified: Boolean(user.emailVerifiedAt),
        }),
      };
    },
  };

  const provider = new Provider(issuer, configuration);
  // Believe X-Forwarded-* only when the API sits behind proxies it trusts; with an empty
  // list the API is exposed directly and a client could forge its scheme and host.
  provider.proxy = Boolean(config.REMENTUM_TRUSTED_PROXIES);
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
  // The interaction login form checks a password, so it needs the same budget as the
  // session endpoint rather than the far looser global limit.
  const loginRateLimit = { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } };

  // The sign-in and consent screens are the only HTML this API serves, and helmet runs
  // with contentSecurityPolicy disabled. They need no scripts and no remote assets, so
  // lock them down and refuse to be framed, which is what a consent screen is for.
  // form-action is deliberately absent: some browsers enforce it across the redirect chain
  // that follows the sign-in POST, which is exactly how the authorization code reaches the
  // client's redirect_uri.
  const interactionCsp = [
    "default-src 'none'",
    "img-src 'self' data:",
    "style-src 'unsafe-inline'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join("; ");
  const html = (reply: FastifyReply) =>
    reply
      .header("content-security-policy", interactionCsp)
      .header("referrer-policy", "no-referrer")
      .type("text/html; charset=utf-8");

  app.get("/oauth/interaction/:uid", async (request, reply) => {
    const details = await runtime.provider.interactionDetails(request.raw, reply.raw);
    const prompt = details.prompt.name;
    const action = `/oauth/interaction/${details.uid}/${prompt === "login" ? "login" : "confirm"}`;
    const body =
      prompt === "login"
        ? `<label>Email<input name="email" type="email" autocomplete="username" required></label>
         <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
         <div class="auth-links"><a href="${escapeHtml(`${runtime.publicUrl}/forgot-password`)}">Forgot password?</a>${runtime.allowSignup ? `<a href="${escapeHtml(`${runtime.publicUrl}/register`)}">Create account</a>` : ""}</div>`
        : await consentBody(runtime, details.params);
    return html(reply).send(interactionPage(prompt, action, details.uid, body));
  });

  app.post("/oauth/interaction/:uid/login", loginRateLimit, async (request, reply) => {
    const body = loginFormFields(request.body);
    const user = await verifyCredentials(body.email, body.password);
    if (!user) {
      return html(reply.code(401)).send(
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
      return html(reply.code(403)).send(
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

  // The issuer lives under /oauth, so RFC 8414 places its metadata at the path-aware
  // location and some clients also try the root; both lead to the document the provider
  // serves under the issuer itself.
  const discovery = `${runtime.issuer}/.well-known/openid-configuration`;
  for (const path of [
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-authorization-server/oauth",
    "/.well-known/openid-configuration",
    "/.well-known/openid-configuration/oauth",
  ]) {
    app.get(path, async (_request, reply) => reply.redirect(discovery, 302));
  }

  app.get("/icon.svg", async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=86400, immutable")
      .type("image/svg+xml")
      .send(brandFaviconSvg),
  );
  app.get("/favicon.ico", async (_request, reply) => reply.redirect("/icon.svg", 302));
}

/**
 * The sign-in form body is whatever the browser (or anything else) posted. A repeated
 * field arrives as an array, and calling `.trim()` on it used to crash the request with a
 * 500; anything that is not a plain string is treated as a wrong password instead.
 */
export function loginFormFields(body: unknown): { email: string; password: string } {
  const parsed = z
    .object({
      email: z.string().max(320).default(""),
      password: z.string().max(1000).default(""),
    })
    .safeParse(body ?? {});
  return parsed.success ? parsed.data : { email: "", password: "" };
}

/**
 * A client identified by a Client ID Metadata Document is whoever controls that URL, and the
 * document's `client_name` is whatever they chose to write there. The consent screen therefore
 * names the document's host as the requesting party and leaves the name out, as the MCP
 * authorization spec asks. Every consent screen also says where the browser goes next: a loopback
 * redirect can be claimed by any program on the machine, so the user must know they started it.
 */
async function consentBody(
  runtime: OauthRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const clientId = String(params.client_id);
  const documentHost = clientMetadataDocumentHost(clientId);
  const client = documentHost ? undefined : await runtime.provider.Client.find(clientId);
  const target = redirectTarget(String(params.redirect_uri ?? ""));
  const destination = target.loopback
    ? `<strong>${escapeHtml(target.label)}</strong>, a program on this computer. Approve only if you started this connection yourself.`
    : `<strong>${escapeHtml(target.label)}</strong>.`;
  return `<p><strong>${escapeHtml(documentHost ?? client?.clientName ?? clientId)}</strong> requests access to Rementum.</p>
         ${documentHost ? `<p class="detail">Identified by its client metadata document <code>${escapeHtml(clientId)}</code>.</p>` : ""}
         <p class="detail">After you approve, your browser continues to ${destination}</p>
         <p class="scope">${escapeHtml(String(params.scope ?? ""))}</p>`;
}

/**
 * The provider resolves an https URL that no registered client owns by fetching it as a Client ID
 * Metadata Document, so by the time an interaction exists such a client id has been fetched and
 * validated. The host is the one part of the id its owner cannot pick freely.
 */
export function clientMetadataDocumentHost(clientId: string): string | null {
  const url = URL.parse(clientId);
  return url?.protocol === "https:" && url.host ? url.host : null;
}

export function redirectTarget(redirectUri: string): { label: string; loopback: boolean } {
  const url = URL.parse(redirectUri);
  if (!url) return { label: redirectUri, loopback: false };
  if (url.protocol === "http:" || url.protocol === "https:") {
    return { label: url.hostname, loopback: loopbackHosts.has(url.hostname) };
  }
  // A custom scheme names the installed app that registered it, so show the whole authority.
  return { label: `${url.protocol}//${url.host}`, loopback: false };
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

const brandFaviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 164 164" fill="none"><title>Rementum</title><defs><linearGradient id="rmTealTile" x1="120" y1="150" x2="470" y2="600" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5cc0a8"/><stop offset="1" stop-color="#2e7d64"/></linearGradient></defs><rect width="164" height="164" rx="38" fill="#091514"/><g transform="translate(26,33.88) scale(0.15599)"><path d="M15 197C2 203 -3 218 3 232C12 251 35 276 52 284C59 287 75 293 82 295C95 297 95 297 129 333C146 350 163 369 189 398C229 441 235 447 248 454C267 465 273 466 327 466C368 466 370 466 371 464C374 461 374 461 347 432C333 418 318 402 314 397C305 387 273 352 272 350C271 350 268 346 265 342C261 339 247 323 233 308C219 293 204 277 200 272C188 259 170 239 160 229C139 208 126 201 104 198C91 195 19 195 15 197Z M22 378C13 380 2 392 0 401C0 403 0 409 0 413C1 427 6 435 31 461C46 476 77 509 108 541C144 581 163 594 196 606C227 617 228 617 372 617C506 617 501 617 503 611C503 608 503 607 484 587C447 547 425 525 421 522C417 520 417 520 333 520C255 519 248 519 243 518C227 513 210 505 198 495C192 490 185 484 156 452C152 448 142 437 133 428C125 420 113 407 107 400C92 384 87 380 76 378C69 377 27 377 22 378Z" fill="url(#rmTealTile)"/><path d="M15 2C3 8 -1 20 2 40C5 58 25 82 43 90C44 90 46 91 49 92C53 94 63 97 69 99C71 99 155 99 257 99C442 100 443 100 452 102C488 110 512 133 526 172C530 182 530 182 529 200C529 220 529 222 523 237C512 263 490 283 463 293C455 295 455 295 394 296C333 296 333 296 329 300C323 305 321 314 325 322C326 324 332 332 340 340C356 356 375 377 393 396C401 404 414 419 424 429C434 439 447 454 454 461C461 468 473 482 482 491C491 500 502 512 507 518C533 546 567 583 574 590C584 600 593 605 611 611C623 615 630 615 674 615C718 615 719 615 717 610C715 608 694 584 681 570C676 565 664 552 653 539C642 527 629 513 624 508C619 504 606 489 594 476C582 463 569 449 565 445C554 433 516 391 512 387C509 384 509 382 510 381C511 380 517 376 521 374C525 373 542 363 550 357C590 327 620 274 625 224C629 185 622 147 605 110C582 64 537 24 490 10C485 8 478 6 476 5C474 5 465 3 457 2C442 0 433 0 231 0C21 0 21 0 15 2Z" fill="#f3f5f1"/></g></svg>`;

const brandMarkSvg = `<svg class="mark" viewBox="0 0 718 617" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="rmTeal" x1="120" y1="150" x2="470" y2="600" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5cc0a8"/><stop offset="1" stop-color="#2e7d64"/></linearGradient></defs><path d="M15 197C2 203 -3 218 3 232C12 251 35 276 52 284C59 287 75 293 82 295C95 297 95 297 129 333C146 350 163 369 189 398C229 441 235 447 248 454C267 465 273 466 327 466C368 466 370 466 371 464C374 461 374 461 347 432C333 418 318 402 314 397C305 387 273 352 272 350C271 350 268 346 265 342C261 339 247 323 233 308C219 293 204 277 200 272C188 259 170 239 160 229C139 208 126 201 104 198C91 195 19 195 15 197Z M22 378C13 380 2 392 0 401C0 403 0 409 0 413C1 427 6 435 31 461C46 476 77 509 108 541C144 581 163 594 196 606C227 617 228 617 372 617C506 617 501 617 503 611C503 608 503 607 484 587C447 547 425 525 421 522C417 520 417 520 333 520C255 519 248 519 243 518C227 513 210 505 198 495C192 490 185 484 156 452C152 448 142 437 133 428C125 420 113 407 107 400C92 384 87 380 76 378C69 377 27 377 22 378Z" fill="url(#rmTeal)"/><path d="M15 2C3 8 -1 20 2 40C5 58 25 82 43 90C44 90 46 91 49 92C53 94 63 97 69 99C71 99 155 99 257 99C442 100 443 100 452 102C488 110 512 133 526 172C530 182 530 182 529 200C529 220 529 222 523 237C512 263 490 283 463 293C455 295 455 295 394 296C333 296 333 296 329 300C323 305 321 314 325 322C326 324 332 332 340 340C356 356 375 377 393 396C401 404 414 419 424 429C434 439 447 454 454 461C461 468 473 482 482 491C491 500 502 512 507 518C533 546 567 583 574 590C584 600 593 605 611 611C623 615 630 615 674 615C718 615 719 615 717 610C715 608 694 584 681 570C676 565 664 552 653 539C642 527 629 513 624 508C619 504 606 489 594 476C582 463 569 449 565 445C554 433 516 391 512 387C509 384 509 382 510 381C511 380 517 376 521 374C525 373 542 363 550 357C590 327 620 274 625 224C629 185 622 147 605 110C582 64 537 24 490 10C485 8 478 6 476 5C474 5 465 3 457 2C442 0 433 0 231 0C21 0 21 0 15 2Z" fill="currentColor"/></svg>`;

function interactionPage(prompt: string, action: string, uid: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Rementum | ${escapeHtml(prompt)}</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><style>
  :root{color-scheme:light dark;--canvas:#0f1714;--surface:#17211e;--raised:#1c2924;--field:#111a16;--text:#f3f5f1;--muted:#bdcbc5;--quiet:#8fa099;--line:rgb(243 245 241 / 12%);--danger:#e2b6b6;--danger-bg:rgb(226 182 182 / 10%);--danger-line:rgb(226 182 182 / 25%);--accent:#2f8a70;--accent-hover:#37a183;--accent-ink:#f3f5f1;--ring:rgb(47 138 112 / 25%);--glow:0 0 24px rgb(47 138 112 / 30%)}
  @media(prefers-color-scheme:light){:root{--canvas:#f3f5f1;--surface:#ffffff;--raised:#e9efe9;--field:#ffffff;--text:#17211e;--muted:#43544d;--quiet:#64756d;--line:rgb(23 33 30 / 12%);--danger:#a03d3d;--danger-bg:rgb(160 61 61 / 8%);--danger-line:rgb(160 61 61 / 25%);--accent:#2f6f5e;--accent-hover:#255849;--ring:rgb(47 111 94 / 20%);--glow:0 0 24px rgb(47 111 94 / 16%)}}
  *{box-sizing:border-box}body{min-width:320px;min-height:100dvh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 15%,rgb(47 138 112 / 8%),transparent 40%),var(--canvas);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
  main{width:min(430px,100%);padding:26px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:inset 0 1px 0 rgb(255 255 255 / 4%),0 28px 90px rgb(0 0 0 / 32%)}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:34px;color:var(--muted);font-size:13px;font-weight:650}.mark{display:block;width:28px;height:24px;flex:0 0 28px;color:var(--text)}
  h1{margin:0;color:var(--text);font-size:30px;font-weight:620;letter-spacing:-.04em;line-height:1.1}.intro{margin:10px 0 24px;color:var(--muted)}
  label{display:grid;gap:7px;margin:16px 0;color:var(--muted);font-size:12px;font-weight:600}input{min-height:43px;padding:0 11px;border:1px solid var(--line);border-radius:8px;outline:0;background:var(--field);color:var(--text);font:14px ui-sans-serif,system-ui,sans-serif;transition:border-color .15s ease,background .15s ease,box-shadow .15s ease}input:focus{border-color:var(--accent);background:var(--raised);box-shadow:0 0 0 3px var(--ring)}
  button{width:100%;min-height:43px;margin-top:8px;border:1px solid var(--accent);border-radius:8px;background:var(--accent);color:var(--accent-ink);cursor:pointer;font:650 13px/1 ui-sans-serif,system-ui,sans-serif;transition:background .15s ease,border-color .15s ease,transform .15s ease}button:hover{border-color:var(--accent-hover);background:var(--accent-hover)}button:active{transform:scale(.985)}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.deny{margin-top:8px;border-color:transparent;background:transparent;color:var(--muted);box-shadow:none}.deny:hover{border-color:var(--line);background:var(--raised);color:var(--text)}
  .detail{margin:0 0 12px;color:var(--muted);font-size:12px}.detail strong{color:var(--text)}code{overflow-wrap:anywhere;color:var(--quiet);font:11px ui-monospace,monospace}.scope{overflow-wrap:anywhere;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--quiet);font:11px/1.7 ui-monospace,monospace}.error{padding:10px 12px;border:1px solid var(--danger-line);border-radius:8px;background:var(--danger-bg);color:var(--danger);font-size:12px}.auth-links{display:flex;justify-content:space-between;gap:16px;margin:2px 0 16px}.auth-links a{color:var(--muted);font-size:12px;text-decoration:none}.auth-links a:hover{color:var(--text)}.foot{margin:22px 0 0;color:var(--quiet);font:10px/1.5 ui-monospace,monospace;text-align:center}
  @media(max-width:480px){body{align-items:start;padding:16px}main{margin-top:8vh;padding:21px}.brand{margin-bottom:28px}}
  @media(prefers-reduced-motion:reduce){*{transition-duration:.01ms}}
  </style></head><body><main><div class="brand">${brandMarkSvg}<span>Rementum</span></div><h1>${prompt === "login" ? "Sign in" : "Approve connection"}</h1>
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
