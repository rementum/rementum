import rateLimit from "@fastify/rate-limit";
import { DomainError } from "@rementum/core";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registerProblemDetails } from "./problems.js";

const publicUrl = "https://rementum.example.test";
const workspaceId = "00000000-0000-4000-8000-000000000001";

async function harness(options: { bodyLimit?: number; rateLimit?: number } = {}) {
  const app = Fastify(options.bodyLimit ? { bodyLimit: options.bodyLimit } : {});
  if (options.rateLimit) {
    await app.register(rateLimit, { max: options.rateLimit, timeWindow: "1 minute" });
  }
  app.post("/throw", async (request) => {
    const thrown = (request.body as { kind: string } | undefined)?.kind;
    if (thrown === "zod") z.object({ slug: z.string() }).parse({});
    if (thrown === "domain") throw new DomainError("forbidden", "Not your brain", 403);
    throw new Error("something came loose");
  });
  app.get(`/mcp/workspace/${workspaceId}`, async () => {
    throw new DomainError("unauthorized", "Token required", 401);
  });
  app.get("/scope", async () => {
    throw new DomainError("insufficient_scope", "Missing scope", 403, {
      requiredScope: "brains:write",
    });
  });
  app.get("/ok", async () => ({ ok: true }));
  registerProblemDetails(app, `${publicUrl}/`);
  return app;
}

function post(app: FastifyInstance, kind: string) {
  return app.inject({ method: "POST", url: "/throw", payload: { kind } });
}

describe("problem details", () => {
  it("reports a validation failure with the offending paths", async () => {
    const response = await post(await harness(), "zod");
    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({
      type: "urn:rementum:problem:validation",
      status: 400,
      code: "validation",
      instance: "/throw",
    });
    expect(response.json().detail).toContain("slug");
  });

  it("reports a domain failure with its own status and code", async () => {
    const response = await post(await harness(), "domain");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      type: "urn:rementum:problem:forbidden",
      title: "Not your brain",
      status: 403,
      code: "forbidden",
    });
  });

  it("points an unauthenticated MCP client at the resource metadata for its workspace", async () => {
    const app = await harness();
    const response = await app.inject({ method: "GET", url: `/mcp/workspace/${workspaceId}?x=1` });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe(
      `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp/workspace/${workspaceId}"`,
    );
  });

  it("names the missing scope when one is withheld", async () => {
    const response = await (await harness()).inject({ method: "GET", url: "/scope" });
    expect(response.headers["www-authenticate"]).toBe(
      'Bearer error="insufficient_scope", scope="brains:write"',
    );
  });

  it("keeps an unknown failure opaque", async () => {
    const response = await post(await harness(), "other");
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      type: "urn:rementum:problem:internal",
      title: "Internal server error",
      status: 500,
      code: "internal",
    });
    expect(JSON.stringify(response.json())).not.toContain("something came loose");
  });

  // Without this the rate limiter and the body limits are invisible to a client: every
  // one of them arrives as a 500 that reads like the server broke.
  it("keeps the status a framework failure already carries", async () => {
    const app = await harness({ bodyLimit: 128 });
    const malformed = await app.inject({
      method: "POST",
      url: "/throw",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.headers["content-type"]).toContain("application/problem+json");
    expect(malformed.json()).toMatchObject({
      type: "urn:rementum:problem:request",
      status: 400,
      code: "FST_ERR_CTP_INVALID_JSON_BODY",
    });

    const oversized = await app.inject({
      method: "POST",
      url: "/throw",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ kind: "x".repeat(500) }),
    });
    expect(oversized.statusCode).toBe(413);

    const wrongType = await app.inject({
      method: "POST",
      url: "/throw",
      headers: { "content-type": "text/csv" },
      payload: "a,b",
    });
    expect(wrongType.statusCode).toBe(415);
  });

  it("reports a tripped rate limit as 429 with its retry hint intact", async () => {
    const app = await harness({ rateLimit: 1 });
    expect((await app.inject({ method: "GET", url: "/ok" })).statusCode).toBe(200);
    const limited = await app.inject({ method: "GET", url: "/ok" });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.json()).toMatchObject({ type: "urn:rementum:problem:request", status: 429 });
  });
});
