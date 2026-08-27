import { WEB_SESSION_CLIENT_ID } from "@rementum/contracts";
import { DomainError } from "@rementum/core";
import type { AuthRepository, PostgresStore } from "@rementum/db";
import type { FastifyRequest } from "fastify";
import { createLocalJWKSet, type JWK, type JWTPayload, jwtVerify } from "jose";
import { type ScopedActor, withAccessScopes, withAllAccessScopes } from "./access.js";
import type { AppConfig } from "./config.js";
import type { OauthRuntime } from "./oauth.js";
import { requirePublicOrigin, resolveWebSession } from "./web-session.js";

export function createAuthenticator(
  config: AppConfig,
  runtime: OauthRuntime,
  store: PostgresStore,
  auth: AuthRepository,
) {
  const jwks = createLocalJWKSet(runtime.publicJwks as { keys: JWK[] });
  return async function authenticate(request: FastifyRequest): Promise<ScopedActor> {
    const path = request.url.split("?", 1)[0] ?? "";
    const workspaceId = workspaceIdFromMcpPath(path);
    // Defence in depth: loadConfig already refuses this flag in production, so an
    // enabled flag here can only come from a non-production process.
    if (config.REMENTUM_DEV_AUTH && config.NODE_ENV !== "production") {
      const userId = request.headers["x-rementum-user-id"];
      if (typeof userId === "string") {
        const actor = await store.loadActor(userId, "dev-header");
        return withAllAccessScopes(
          workspaceId ? await store.scopeActorToWorkspace(actor, workspaceId) : actor,
          workspaceId,
        );
      }
    }
    if (!workspaceId) {
      const session = await resolveWebSession(request, auth);
      if (!session) {
        throw new DomainError("unauthorized", "A valid web session is required", 401);
      }
      if (!new Set(["GET", "HEAD", "OPTIONS"]).has(request.method)) {
        requirePublicOrigin(request, runtime.publicUrl);
      }
      return withAllAccessScopes(await store.loadActor(session.userId, WEB_SESSION_CLIENT_ID));
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new DomainError("unauthorized", "A bearer access token is required", 401);
    }
    const token = authorization.slice("Bearer ".length);
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: runtime.issuer,
        audience: runtime.workspaceResource(workspaceId),
      }));
      if (!payload.sub) throw new Error("Token has no subject");
    } catch {
      throw new DomainError("invalid_token", "The bearer token is invalid or expired", 401);
    }
    const actor = await store.loadActor(
      payload.sub as string,
      typeof payload.client_id === "string" ? payload.client_id : null,
    );
    return withAccessScopes(
      await store.scopeActorToWorkspace(actor, workspaceId),
      payload.scope,
      workspaceId,
    );
  };
}

export function workspaceIdFromMcpPath(path: string): string | null {
  const match =
    /^\/mcp\/workspace\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
      path,
    );
  return match?.[1] ?? null;
}
