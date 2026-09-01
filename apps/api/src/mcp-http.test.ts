import type { RementumService } from "@rementum/core";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withAccessScopes } from "./access.js";
import { registerWorkspaceMcpEndpoint } from "./mcp.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const brainId = "00000000-0000-4000-8000-000000000002";
const publicUrl = "https://rementum.example.test";
const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function createApp() {
  const app = Fastify();
  const actor = withAccessScopes(
    {
      userId: "00000000-0000-4000-8000-000000000003",
      clientId: "modern-client",
      teamRoles: new Map(),
      workspaceRoles: new Map([[workspaceId, "owner"]]),
      brainRoles: new Map([[brainId, "owner"]]),
    },
    "brain:read",
    workspaceId,
  );
  const service = {
    listBrains: vi.fn(async () => ({
      items: [
        {
          id: brainId,
          workspaceId,
          slug: "product",
          name: "Product",
          description: "Product knowledge",
          instructions: "Read the routing index.",
          createdBy: actor.userId,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      total: 1,
    })),
  } as unknown as RementumService;
  await registerWorkspaceMcpEndpoint(app, service, async () => actor, publicUrl);
  openApps.push(app);
  return { app, service };
}

function modernMeta() {
  return {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "1.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

describe("MCP HTTP protocol eras", () => {
  it("serves a modern private cacheable tool catalog as JSON", async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: "POST",
      url: `/mcp/workspace/${workspaceId}`,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/list",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: modernMeta() },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
    const body = response.json();
    expect(body.result).toMatchObject({
      resultType: "complete",
      ttlMs: 300_000,
      cacheScope: "private",
    });
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("load_context");
    expect(names).not.toContain("stage_write");
  });

  it("routes modern tool calls through the authenticated actor", async () => {
    const { app, service } = await createApp();
    const response = await app.inject({
      method: "POST",
      url: `/mcp/workspace/${workspaceId}`,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "tools/call",
        "mcp-name": "list_brains",
      },
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "list_brains",
          arguments: { limit: 25 },
          _meta: modernMeta(),
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json().result).toMatchObject({
      resultType: "complete",
      structuredContent: {
        items: [{ id: brainId, slug: "product", name: "Product" }],
        total: 1,
        hasMore: false,
      },
    });
    expect(service.listBrains).toHaveBeenCalledOnce();
  });

  it("keeps legacy initialization stateless and JSON-only", async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: "POST",
      url: `/mcp/workspace/${workspaceId}`,
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        id: 3,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "legacy-client", version: "1.0.0" },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
    expect(response.headers).not.toHaveProperty("mcp-session-id");
    expect(response.json().result).toMatchObject({ protocolVersion: "2025-11-25" });
  });
});
