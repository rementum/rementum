import { type Actor, DomainError } from "@owl-memory/core";
import type { PostgresStore } from "@owl-memory/db";
import type { FastifyRequest } from "fastify";
import { createLocalJWKSet, type JWK, jwtVerify } from "jose";
import type { AppConfig } from "./config.js";
import type { OauthRuntime } from "./oauth.js";

export function createAuthenticator(
  config: AppConfig,
  runtime: OauthRuntime,
  store: PostgresStore,
) {
  const jwks = createLocalJWKSet(runtime.publicJwks as { keys: JWK[] });
  return async function authenticate(request: FastifyRequest): Promise<Actor> {
    if (config.OWL_DEV_AUTH) {
      const userId = request.headers["x-owl-user-id"];
      if (typeof userId === "string") return store.loadActor(userId, "dev-header");
    }
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new DomainError("unauthorized", "A bearer access token is required", 401);
    }
    const token = authorization.slice("Bearer ".length);
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer: runtime.issuer });
      if (!payload.sub) throw new Error("Token has no subject");
      const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      const accepted = [runtime.resource, `${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/api`];
      if (!audience.some((value) => value && accepted.includes(value)))
        throw new Error("Wrong audience");
      return store.loadActor(
        payload.sub,
        typeof payload.client_id === "string" ? payload.client_id : null,
      );
    } catch {
      throw new DomainError("invalid_token", "The bearer token is invalid or expired", 401);
    }
  };
}
