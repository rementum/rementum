import { mkdir } from "node:fs/promises";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import middie from "@fastify/middie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { DomainError, parseMasterKey, RementumService } from "@rementum/core";
import { AuthRepository, createDatabaseClient, PostgresStore } from "@rementum/db";
import Fastify from "fastify";
import { ZodError } from "zod";
import { createAuthenticator, workspaceIdFromMcpPath } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createCredentialVerifier } from "./credentials.js";
import { HttpEmbeddingClient } from "./embeddings.js";
import { ResendMailer, type TransactionalMailer } from "./mailer.js";
import { registerWorkspaceMcpEndpoint } from "./mcp.js";
import { buildOauthRuntime, registerOauthRoutes } from "./oauth.js";
import { registerApiRoutes } from "./routes.js";
import { OpenAICompatibleArticleGenerator } from "./summaries.js";
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
    trustProxy: true,
    genReqId: (request) => String(request.headers["x-request-id"] ?? crypto.randomUUID()),
  });
  const database = createDatabaseClient(config.REMENTUM_DATABASE_URL);
  const store = new PostgresStore(database);
  const authRepository = new AuthRepository(database);
  const embeddings = new HttpEmbeddingClient(config.REMENTUM_EMBEDDINGS_URL);
  const articleGenerator =
    config.REMENTUM_LLM_ENABLED && config.REMENTUM_LLM_BASE_URL && config.REMENTUM_LLM_MODEL
      ? new OpenAICompatibleArticleGenerator({
          baseUrl: config.REMENTUM_LLM_BASE_URL,
          model: config.REMENTUM_LLM_MODEL,
          ...(config.REMENTUM_LLM_API_KEY ? { apiKey: config.REMENTUM_LLM_API_KEY } : {}),
          ...(config.REMENTUM_LLM_REASONING_EFFORT
            ? { reasoningEffort: config.REMENTUM_LLM_REASONING_EFFORT }
            : {}),
          timeoutMs: config.REMENTUM_LLM_TIMEOUT_MS,
          maxInputChars: config.REMENTUM_LLM_MAX_INPUT_CHARS,
          concurrency: config.REMENTUM_LLM_CONCURRENCY,
        })
      : undefined;
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
    articleGenerator,
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

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({
          type: "urn:rementum:problem:validation",
          title: "Request validation failed",
          status: 400,
          detail: error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
          instance: request.url,
          code: "validation",
        });
    }
    if (error instanceof DomainError) {
      if (error.status === 401) {
        const workspaceId = workspaceIdFromMcpPath(request.url.split("?", 1)[0] ?? "");
        if (workspaceId) {
          reply.header(
            "WWW-Authenticate",
            `Bearer resource_metadata="${config.REMENTUM_PUBLIC_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource/mcp/workspace/${workspaceId}"`,
          );
        }
      }
      if (error.code === "insufficient_scope") {
        reply.header(
          "WWW-Authenticate",
          `Bearer error="insufficient_scope", scope="${String(error.detail?.requiredScope ?? "")}"`,
        );
      }
      return reply
        .code(error.status)
        .type("application/problem+json")
        .send({
          type: `urn:rementum:problem:${error.code}`,
          title: error.message,
          status: error.status,
          detail: error.detail,
          instance: request.url,
          code: error.code,
        });
    }
    return reply.code(500).type("application/problem+json").send({
      type: "urn:rementum:problem:internal",
      title: "Internal server error",
      status: 500,
      instance: request.url,
      code: "internal",
    });
  });

  app.addHook("onClose", async () => database.close());
  return app;
}
