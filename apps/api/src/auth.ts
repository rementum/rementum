import { DomainError } from "@rementum/core";
import type { PostgresStore } from "@rementum/db";
import type { FastifyRequest } from "fastify";
import { createLocalJWKSet, type JWK, jwtVerify } from "jose";
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
    if (config.REMENTUM_DEV_AUTH) {
      const userId = request.headers["x-rementum-user-id"];
      if (typeof userId === "string") {
        return withAllAccessScopes(await store.loadActor(userId, "dev-header"));
      }
    }
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new DomainError("unauthorized", "A bearer access token is required", 401);
    }
    const token = authorization.slice("Bearer ".length);
    try {
      const path = request.url.split("?", 1)[0];
      const audience = path === "/mcp" ? runtime.resource : runtime.apiResource;
      const { payload } = await jwtVerify(token, jwks, { issuer: runtime.issuer, audience });
      if (!payload.sub) throw new Error("Token has no subject");
      return withAccessScopes(
        await store.loadActor(
          payload.sub,
          typeof payload.client_id === "string" ? payload.client_id : null,
        ),
        payload.scope,
      );
    } catch {
      throw new DomainError("invalid_token", "The bearer token is invalid or expired", 401);
    }
  };
}
