import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { RementumService } from "@rementum/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withAccessScopes } from "./access.js";
import { createMcpServer } from "./mcp.js";

const open: Array<{ client: Client; server: ReturnType<typeof createMcpServer> }> = [];

afterEach(async () => {
  await Promise.all(
    open.splice(0).map(({ client, server }) => Promise.all([client.close(), server.close()])),
  );
});

async function connectedClient(scopes: string, service: RementumService) {
  const actor = withAccessScopes(
    {
      userId: "00000000-0000-4000-8000-000000000001",
      clientId: "test-client",
      workspaceRoles: new Map(),
      brainRoles: new Map(),
    },
    scopes,
  );
  const server = createMcpServer(service, actor);
  const client = new Client({ name: "scope-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  open.push({ client, server });
  return client;
}

describe("MCP OAuth scopes", () => {
  it("allows a matching read tool", async () => {
    const service = { listBrains: vi.fn(async () => []) } as unknown as RementumService;
    const client = await connectedClient("brain:read", service);
    const response = await client.callTool({ name: "list_brains", arguments: {} });
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toEqual({ items: [] });
    expect(service.listBrains).toHaveBeenCalledOnce();
  });

  it("blocks a write tool before the service is called", async () => {
    const service = { stageWrite: vi.fn() } as unknown as RementumService;
    const client = await connectedClient("brain:read", service);
    const response = await client.callTool({
      name: "stage_write",
      arguments: {
        brainId: "00000000-0000-4000-8000-000000000002",
        operation: "create",
        slug: "blocked-write",
        title: "Blocked write",
        body: "Body",
        changeSummary: "Should not run",
      },
    });
    expect(response).toMatchObject({ isError: true });
    expect(service.stageWrite).not.toHaveBeenCalled();
  });
});
