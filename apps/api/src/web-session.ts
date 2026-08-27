import { randomBytes } from "node:crypto";
import { DomainError, hashContent } from "@rementum/core";
import type { AuthRepository } from "@rementum/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { VerifyCredentials } from "./credentials.js";

export const WEB_SESSION_COOKIE = "rementum_session";
const WEB_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

export async function registerWebSessionRoutes(
  app: FastifyInstance,
  auth: AuthRepository,
  verifyCredentials: VerifyCredentials,
  config: AppConfig,
): Promise<void> {
  const rateLimit = { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } };

  app.post("/api/v1/auth/session", rateLimit, async (request, reply) => {
    requirePublicOrigin(request, config.REMENTUM_PUBLIC_URL);
    const input = z
      .object({ email: z.string().trim().min(1).max(320), password: z.string().min(1).max(1000) })
      .parse(request.body);
    const user = await verifyCredentials(input.email, input.password);
    if (!user) throw new DomainError("invalid_credentials", "Invalid email or password", 401);
    if (!user.emailVerifiedAt) {
      throw new DomainError("email_unverified", "Verify your email before signing in", 403);
    }
    const token = randomBytes(32).toString("base64url");
    await auth.createWebSession(
      user.id,
      hashContent(token),
      new Date(Date.now() + WEB_SESSION_TTL_SECONDS * 1000),
    );
    reply.setCookie(WEB_SESSION_COOKIE, token, webSessionCookieOptions(config));
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/session", async (request) => {
    const session = await resolveWebSession(request, auth);
    if (!session) throw new DomainError("unauthorized", "A valid web session is required", 401);
    return { authenticated: true };
  });

  app.delete("/api/v1/auth/session", async (request, reply) => {
    requirePublicOrigin(request, config.REMENTUM_PUBLIC_URL);
    const token = webSessionToken(request);
    if (token) await auth.revokeWebSession(hashContent(token));
    reply.clearCookie(WEB_SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });
}

export async function resolveWebSession(
  request: FastifyRequest,
  auth: AuthRepository,
): Promise<{ userId: string } | null> {
  const token = webSessionToken(request);
  return token ? auth.findWebSession(hashContent(token)) : null;
}

export function requirePublicOrigin(request: FastifyRequest, publicUrl: string): void {
  if (request.headers.origin !== new URL(publicUrl).origin) {
    throw new DomainError("invalid_origin", "The request origin is not allowed", 403);
  }
}

function webSessionToken(request: FastifyRequest): string | null {
  const token = request.cookies?.[WEB_SESSION_COOKIE];
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function webSessionCookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.REMENTUM_PUBLIC_URL.startsWith("https://"),
    sameSite: "lax" as const,
    maxAge: WEB_SESSION_TTL_SECONDS,
    path: "/",
  };
}
