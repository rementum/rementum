import { mkdir } from "node:fs/promises";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import middie from "@fastify/middie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { parseMasterKey, RementumService } from "@rementum/core";
import { AuthRepository, createDatabaseClient, PostgresStore } from "@rementum/db";
import Fastify from "fastify";
import { createAuthenticator } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createCredentialVerifier } from "./credentials.js";
import { HttpEmbeddingClient } from "./embeddings.js";
import { ResendMailer, type TransactionalMailer } from "./mailer.js";
import { registerWorkspaceMcpEndpoint } from "./mcp.js";
import { buildOauthRuntime, registerOauthRoutes } from "./oauth.js";
import { registerProblemDetails } from "./problems.js";
import { registerApiRoutes } from "./routes.js";
import { registerWebSessionRoutes } from "./web-session.js";

export async function buildApp(
  config: AppConfig,
  overrides: { mailer?: TransactionalMailer | null } = {},
) {
  await Promise.all([
    mkdir(config.REMENTUM_BLOB_DIR, { recursive: true }),
    mkdir(config.REMENTUM_EXPORT_DIR, { recursive: true }),
  ]);
  const app = Fastify({
    logger: { level: config.REMENTUM_LOG_LEVEL },
    bodyLimit: 2_000_000,
    trustProxy: config.REMENTUM_TRUSTED_PROXIES || false,
    genReqId: (request) => String(request.headers["x-request-id"] ?? crypto.randomUUID()),
  });
  const database = createDatabaseClient(config.REMENTUM_DATABASE_URL);
  const store = new PostgresStore(database);
  const authRepository = new AuthRepository(database);
  const embeddings = new HttpEmbeddingClient(config.REMENTUM_EMBEDDINGS_URL);
  const llmAvailable = Boolean(
    config.REMENTUM_LLM_ENABLED && config.REMENTUM_LLM_BASE_URL && config.REMENTUM_LLM_MODEL,
  );
  const mailer =
    overrides.mailer !== undefined
      ? overrides.mailer
      : config.REMENTUM_RESEND_API_KEY && config.REMENTUM_MAIL_FROM
        ? new ResendMailer(config.REMENTUM_RESEND_API_KEY, config.REMENTUM_MAIL_FROM)
        : null;
  const service = new RementumService(
    store,
    embeddings,
    parseMasterKey(config.REMENTUM_MASTER_KEY),
    null,
    llmAvailable,
  );
  const oauth = await buildOauthRuntime(config, database);
  const verifyCredentials = await createCredentialVerifier(authRepository);
  const authenticate = createAuthenticator(config, oauth, store, authRepository);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: false });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 20 },
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });
  await app.register(middie);

  await registerOauthRoutes(app, oauth, verifyCredentials);
  await registerWebSessionRoutes(app, authRepository, verifyCredentials, config);
  app.use((request, response, next) => {
    const original = request.url ?? "";
    if (!original.startsWith("/oauth/") || original.startsWith("/oauth/interaction/")) {
      next();
      return;
    }
    request.url = original.slice("/oauth".length) || "/";
    oauth.provider.callback()(request, response).catch(next);
  });

  app.get("/healthz", async (request, reply) => {
    try {
      await database.sql`SELECT 1`;
      const semantic = await embeddings.healthy();
      return reply.code(200).send({ ok: true, version: "0.1.0", semanticSearch: semantic });
    } catch (error) {
      request.log.error(error, "Health check failed");
      return reply.code(503).send({ ok: false, error: "dependency_unavailable" });
    }
  });
  app.get("/readyz", async (_request, reply) => {
    try {
      await database.sql`SELECT 1`;
      return reply.send({ ok: true });
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  app.get("/metrics", async (_request, reply) =>
    reply
      .type("text/plain; version=0.0.4")
      .send(
        [
          "# HELP rementum_info Build information.",
          "# TYPE rementum_info gauge",
          'rementum_info{version="0.1.0"} 1',
          "",
        ].join("\n"),
      ),
  );
  await registerApiRoutes(app, service, authenticate, authRepository, config, mailer);
  await registerWorkspaceMcpEndpoint(
    app,
    service,
    authenticate,
    config.REMENTUM_PUBLIC_URL.replace(/\/$/, ""),
  );

  registerProblemDetails(app, config.REMENTUM_PUBLIC_URL);

  app.addHook("onClose", async () => database.close());
  return app;
}
