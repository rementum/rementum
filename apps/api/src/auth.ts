import { DomainError } from "@rementum/core";
import type { PostgresStore } from "@rementum/db";
import type { FastifyRequest } from "fastify";
import { createLocalJWKSet, type JWK, type JWTPayload, jwtVerify } from "jose";
import { type ScopedActor, withAccessScopes, withAllAccessScopes } from "./access.js";
import type { AppConfig } from "./config.js";
import type { OauthRuntime } from "./oauth.js";

export function createAuthenticator(
  config: AppConfig,
  runtime: OauthRuntime,
  store: PostgresStore,
) {
  const jwks = createLocalJWKSet(runtime.publicJwks as { keys: JWK[] });
  return async function authenticate(request: FastifyRequest): Promise<ScopedActor> {
    const path = request.url.split("?", 1)[0] ?? "";
    const workspaceId = workspaceIdFromMcpPath(path);
    if (config.REMENTUM_DEV_AUTH) {
      const userId = request.headers["x-rementum-user-id"];
      if (typeof userId === "string") {
        const actor = await store.loadActor(userId, "dev-header");
        return withAllAccessScopes(
          workspaceId ? await store.scopeActorToWorkspace(actor, workspaceId) : actor,
          workspaceId,
        );
      }
    }
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new DomainError("unauthorized", "A bearer access token is required", 401);
    }
    const token = authorization.slice("Bearer ".length);
    let payload: JWTPayload;
    try {
      const audience = workspaceId ? runtime.workspaceResource(workspaceId) : runtime.apiResource;
      ({ payload } = await jwtVerify(token, jwks, { issuer: runtime.issuer, audience }));
      if (!payload.sub) throw new Error("Token has no subject");
    } catch {
      throw new DomainError("invalid_token", "The bearer token is invalid or expired", 401);
    }
    const actor = await store.loadActor(
      payload.sub as string,
      typeof payload.client_id === "string" ? payload.client_id : null,
    );
    return withAccessScopes(
      workspaceId ? await store.scopeActorToWorkspace(actor, workspaceId) : actor,
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
