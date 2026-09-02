import { DomainError } from "@rementum/core";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { workspaceIdFromMcpPath } from "./auth.js";

/**
 * Maps validation and domain failures onto RFC 9457 problem documents.
 *
 * `publicUrl` is the instance origin, used to point an unauthenticated MCP client at the
 * protected-resource metadata for the workspace it asked for.
 */
export function registerProblemDetails(app: FastifyInstance, publicUrl: string): void {
  const origin = publicUrl.replace(/\/$/, "");
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // A client's own mistake (validation, a stale session, a missing brain) is not an
    // incident; logging every one at error level buried the faults that are.
    const failureStatus = error instanceof DomainError ? error.status : error.statusCode;
    if (typeof failureStatus === "number" && failureStatus >= 400 && failureStatus < 500) {
      request.log.info({ err: error }, "Request failed");
    } else {
      request.log.error(error);
    }
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
            `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp/workspace/${workspaceId}"`,
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
    // Fastify and its plugins raise their own failures through this handler: a malformed
    // body, an upload past the limit, a tripped rate limit. Reporting those as 500 hides
    // the caller's mistake behind a server fault, so a status the framework already
    // decided on is kept. Only client errors are passed through; a 5xx carries an
    // internal message and stays opaque.
    const status = error.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply
        .code(status)
        .type("application/problem+json")
        .send({
          type: "urn:rementum:problem:request",
          title: error.message,
          status,
          instance: request.url,
          code: typeof error.code === "string" ? error.code : "request",
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
}
