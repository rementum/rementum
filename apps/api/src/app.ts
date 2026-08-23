import { mkdir } from "node:fs/promises";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import middie from "@fastify/middie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { DomainError, OwlService, parseMasterKey } from "@owl-memory/core";
import { AuthRepository, createDatabaseClient, PostgresStore } from "@owl-memory/db";
import Fastify from "fastify";
import { ZodError } from "zod";
import { createAuthenticator } from "./auth.js";
import type { AppConfig } from "./config.js";
import { HttpEmbeddingClient } from "./embeddings.js";
import { registerMcpEndpoint } from "./mcp.js";
import { buildOauthRuntime, registerOauthRoutes } from "./oauth.js";
import { registerApiRoutes } from "./routes.js";

export async function buildApp(config: AppConfig) {
  await Promise.all([
    mkdir(config.OWL_BLOB_DIR, { recursive: true }),
    mkdir(config.OWL_EXPORT_DIR, { recursive: true }),
  ]);
  const app = Fastify({
    logger: { level: config.OWL_LOG_LEVEL },
    bodyLimit: 2_000_000,
    trustProxy: true,
    genReqId: (request) => String(request.headers["x-request-id"] ?? crypto.randomUUID()),
  });
  const database = createDatabaseClient(config.OWL_DATABASE_URL);
  const store = new PostgresStore(database);
  const authRepository = new AuthRepository(database);
  const embeddings = new HttpEmbeddingClient(config.OWL_EMBEDDINGS_URL);
  const service = new OwlService(store, embeddings, parseMasterKey(config.OWL_MASTER_KEY));
  const oauth = await buildOauthRuntime(config, database);
  const authenticate = createAuthenticator(config, oauth, store);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: false });
  await app.register(formbody);
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 20 },
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Owl Memory API",
        version: "0.1.0",
        description: "Versioned shared knowledge, tasks, imports, and maintenance for AI agents.",
      },
      servers: [{ url: config.OWL_PUBLIC_URL }],
      components: {
        securitySchemes: {
          oauth2: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: `${oauth.issuer}/auth`,
                tokenUrl: `${oauth.issuer}/token`,
                scopes: {
                  "brain:read": "Read brains and articles",
                  "brain:write": "Stage and promote brain changes",
                  "task:read": "Read task queues",
                  "task:write": "Coordinate tasks",
                },
              },
            },
          },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(middie);

  await registerOauthRoutes(app, oauth, authRepository);
  app.use((request, response, next) => {
    const original = request.url ?? "";
    if (!original.startsWith("/oauth/") || original.startsWith("/oauth/interaction/")) {
      next();
      return;
    }
    request.url = original.slice("/oauth".length) || "/";
    oauth.provider.callback()(request, response).catch(next);
  });

  app.get("/healthz", async (_request, reply) => {
    try {
      await database.sql`SELECT 1`;
      const semantic = await embeddings.healthy();
      return reply.code(200).send({ ok: true, version: "0.1.0", semanticSearch: semantic });
    } catch (error) {
      return reply.code(503).send({ ok: false, error: (error as Error).message });
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
          "# HELP owl_memory_info Build information.",
          "# TYPE owl_memory_info gauge",
          'owl_memory_info{version="0.1.0"} 1',
          "",
        ].join("\n"),
      ),
  );
  app.get("/openapi.json", async () => app.swagger());

  await registerApiRoutes(app, service, authenticate, authRepository, config);
  await registerMcpEndpoint(
    app,
    service,
    authenticate,
    `${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource`,
  );

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({
          type: "https://owl-memory.dev/problems/validation",
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
        reply.header(
          "WWW-Authenticate",
          `Bearer resource_metadata="${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource"`,
        );
      }
      return reply
        .code(error.status)
        .type("application/problem+json")
        .send({
          type: `https://owl-memory.dev/problems/${error.code}`,
          title: error.message,
          status: error.status,
          detail: error.detail,
          instance: request.url,
          code: error.code,
        });
    }
    return reply.code(500).type("application/problem+json").send({
      type: "https://owl-memory.dev/problems/internal",
      title: "Internal server error",
      status: 500,
      instance: request.url,
      code: "internal",
    });
  });

  app.addHook("onClose", async () => database.close());
  return app;
}
