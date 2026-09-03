import { randomUUID } from "node:crypto";
import {
  AuthRepository,
  type DatabaseClient,
  OidcPostgresAdapter,
  type PostgresStore,
} from "@rementum/db";
import type { FastifyInstance } from "fastify";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import Provider, { type Configuration, errors } from "oidc-provider";
import { z } from "zod";
import { allAccessScopes } from "./access.js";
import type { AppConfig } from "./config.js";
import { resolveWebSession } from "./web-session.js";

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

export interface OauthRuntime {
  provider: Provider;
  publicJwks: { keys: JWK[] };
  issuer: string;
  publicUrl: string;
  workspaceResource: (workspaceId: string) => string;
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
  };
}

export async function registerOauthRoutes(
  app: FastifyInstance,
  runtime: OauthRuntime,
  auth: AuthRepository,
  store: PostgresStore,
): Promise<void> {
  app.get("/oauth/interaction/:uid", async (request, reply) => {
    const details = await runtime.provider.interactionDetails(request.raw, reply.raw);
    const session = await resolveWebSession(request, auth);
    if (!session) {
      const returnTo = `/oauth/interaction/${encodeURIComponent(details.uid)}`;
      return reply.redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`, 302);
    }

    const workspaceId = workspaceIdFromResource(String(details.params.resource), runtime.publicUrl);
    if (!workspaceId) return reply.code(400).send("Invalid workspace resource");
    const clientId = String(details.params.client_id);
    await store.scopeActorToWorkspace(await store.loadActor(session.userId, clientId), workspaceId);

    // The web session is authoritative. If oidc-provider remembers another account, resubmitting
    // login makes it replace that OAuth session before it recomputes the requested grant.
    if (details.prompt.name === "login" || details.session?.accountId !== session.userId) {
      await runtime.provider.interactionFinished(
        request.raw,
        reply.raw,
        { login: { accountId: session.userId, amr: ["pwd"] } },
        { mergeWithLastSubmission: false },
      );
      reply.hijack();
      return;
    }

    if (details.prompt.name !== "consent") {
      return reply.code(400).send("Unsupported OAuth interaction");
    }
    await runtime.provider.interactionFinished(
      request.raw,
      reply.raw,
      { consent: { grantId: await grantRequestedAccess(runtime, details) } },
      { mergeWithLastSubmission: true },
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

type InteractionDetails = Awaited<ReturnType<Provider["interactionDetails"]>>;

async function grantRequestedAccess(
  runtime: OauthRuntime,
  details: InteractionDetails,
): Promise<string> {
  const { grantId, session, params } = details;
  if (!session?.accountId) throw new Error("OAuth consent has no account");
  let grant = grantId ? await runtime.provider.Grant.find(grantId) : undefined;
  grant ??= new runtime.provider.Grant({
    accountId: session.accountId,
    clientId: String(params.client_id),
  });
  const missing = details.prompt.details as {
    missingOIDCScope?: string[];
    missingOIDCClaims?: string[];
    missingResourceScopes?: Record<string, string[]>;
  };
  if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(" "));
  if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims);
  for (const [indicator, scopes] of Object.entries(missing.missingResourceScopes ?? {})) {
    grant.addResourceScope(indicator, scopes.join(" "));
  }
  return grant.save();
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
