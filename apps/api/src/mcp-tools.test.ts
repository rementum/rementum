import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { RementumService } from "@rementum/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allAccessScopes, withAccessScopes } from "./access.js";
import { createMcpServer, sanitize } from "./mcp.js";

const brainId = "00000000-0000-4000-8000-000000000001";
const articleId = "00000000-0000-4000-8000-000000000002";
const taskId = "00000000-0000-4000-8000-000000000003";
const writeId = "00000000-0000-4000-8000-000000000004";
const workspaceId = "00000000-0000-4000-8000-000000000005";

const open: Array<{ client: Client; server: ReturnType<typeof createMcpServer> }> = [];

afterEach(async () => {
  await Promise.all(
    open.splice(0).map(({ client, server }) => Promise.all([client.close(), server.close()])),
  );
});

function stubService(overrides: Record<string, unknown> = {}): RementumService {
  return {
    listBrains: vi.fn(async () => []),
    searchBrains: vi.fn(async () => []),
    createBrain: vi.fn(async () => ({ brain: { id: brainId }, routingIndex: [] })),
    getBrain: vi.fn(async () => ({
      brain: { id: brainId, slug: "product" },
      routingIndex: [{ id: articleId, slug: "architecture", currentVersion: 2 }],
    })),
    search: vi.fn(async () => []),
    readArticle: vi.fn(async () => ({
      id: articleId,
      slug: "architecture",
      currentVersion: 2,
      body: "# Architecture\n",
    })),
    recentActivity: vi.fn(async () => []),
    stageWrite: vi.fn(async () => ({ id: writeId, status: "pending", body: Buffer.from("x") })),
    promoteWrite: vi.fn(async () => ({ version: { version: 3 } })),
    withdrawWrite: vi.fn(async () => ({ id: writeId, status: "withdrawn" })),
    getWriteStatus: vi.fn(async () => ({ id: writeId, status: "pending" })),
    verifyArticle: vi.fn(async () => ({ id: articleId })),
    setArticleLinks: vi.fn(async () => ({ ok: true })),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => ({ id: taskId })),
    createTask: vi.fn(async () => ({ id: taskId })),
    claimTask: vi.fn(async () => ({ id: taskId })),
    heartbeatTask: vi.fn(async () => ({ id: taskId })),
    releaseTask: vi.fn(async () => ({ id: taskId })),
    updateTask: vi.fn(async () => ({ id: taskId })),
    commentTask: vi.fn(async () => ({ ok: true })),
    attachTaskLink: vi.fn(async () => ({ ok: true })),
    linkTaskArticle: vi.fn(async () => ({ ok: true })),
    scanMaintenance: vi.fn(async () => []),
    listMaintenance: vi.fn(async () => []),
    proposeInvite: vi.fn(async () => ({ id: "invite-id", token: "invite-token" })),
    ...overrides,
  } as unknown as RementumService;
}

async function connect(
  service: RementumService,
  scopes: string = allAccessScopes.join(" "),
  brainRole: "owner" | "editor" = "owner",
) {
  const actor = withAccessScopes(
    {
      userId: "00000000-0000-4000-8000-000000000009",
      clientId: "test-client",
      teamRoles: new Map(),
      workspaceRoles: new Map([[workspaceId, "owner"]]),
      brainRoles: new Map([[brainId, brainRole]]),
    },
    scopes,
    workspaceId,
  );
  const server = createMcpServer(service, actor);
  const client = new Client({ name: "tool-surface-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  open.push({ client, server });
  return client;
}

interface ToolCase {
  tool: string;
  scope: string;
  args: Record<string, unknown>;
  method: keyof RementumService;
  expect?: unknown[];
}

const cases: ToolCase[] = [
  { tool: "list_brains", scope: "brain:read", args: {}, method: "listBrains" },
  {
    tool: "search_brains",
    scope: "brain:read",
    args: { query: "product" },
    method: "searchBrains",
  },
  {
    tool: "get_brain",
    scope: "brain:read",
    args: { brainId, limit: 25 },
    method: "getBrain",
    expect: [brainId, expect.anything(), 25],
  },
  {
    tool: "read_article",
    scope: "brain:read",
    args: { articleId },
    method: "readArticle",
    expect: [articleId, expect.anything()],
  },
  {
    tool: "recent_activity",
    scope: "brain:read",
    args: { brainId, limit: 10 },
    method: "recentActivity",
    expect: [brainId, 10, expect.anything()],
  },
  {
    tool: "search_articles",
    scope: "brain:read",
    args: { brainId, query: "encryption" },
    method: "search",
  },
  {
    tool: "get_write_status",
    scope: "brain:read",
    args: { writeId },
    method: "getWriteStatus",
    expect: [writeId, expect.anything()],
  },
  {
    tool: "list_maintenance_candidates",
    scope: "brain:read",
    args: { brainId },
    method: "listMaintenance",
    expect: [brainId, expect.anything()],
  },
  {
    tool: "create_brain",
    scope: "brain:write",
    args: { name: "New brain", slug: "new-brain", workspaceId },
    method: "createBrain",
  },
  {
    tool: "withdraw_staged_write",
    scope: "brain:write",
    args: { writeId },
    method: "withdrawWrite",
    expect: [writeId, expect.anything()],
  },
  {
    tool: "verify_article",
    scope: "brain:write",
    args: { articleId, reviewAfter: "2026-06-01T00:00:00.000Z" },
    method: "verifyArticle",
    expect: [articleId, new Date("2026-06-01T00:00:00.000Z"), expect.anything()],
  },
  {
    tool: "set_article_links",
    scope: "brain:write",
    args: { articleId, links: [{ toArticleId: articleId, relation: "supports" }] },
    method: "setArticleLinks",
  },
  {
    tool: "scan_brain",
    scope: "brain:write",
    args: { brainId },
    method: "scanMaintenance",
    expect: [brainId, expect.anything()],
  },
  {
    tool: "propose_invite",
    scope: "brain:write",
    args: { brainId, email: "invited@example.test", role: "editor" },
    method: "proposeInvite",
    expect: [brainId, "invited@example.test", "editor", expect.anything()],
  },
  { tool: "list_tasks", scope: "task:read", args: { brainId }, method: "listTasks" },
  { tool: "get_task", scope: "task:read", args: { taskId }, method: "getTask" },
  {
    tool: "create_task",
    scope: "task:write",
    args: { brainId, title: "Task", brief: "Brief" },
    method: "createTask",
  },
  {
    tool: "claim_task",
    scope: "task:write",
    args: { brainId, taskId, leaseSeconds: 900 },
    method: "claimTask",
    expect: [brainId, taskId, 900, expect.anything()],
  },
  {
    tool: "claim_next_task",
    scope: "task:write",
    args: { brainId },
    method: "claimTask",
    expect: [brainId, undefined, 600, expect.anything()],
  },
  {
    tool: "heartbeat_claim",
    scope: "task:write",
    args: { taskId, leaseSeconds: 300 },
    method: "heartbeatTask",
    expect: [taskId, 300, expect.anything()],
  },
  {
    tool: "release_claim",
    scope: "task:write",
    args: { taskId },
    method: "releaseTask",
    expect: [taskId, false, expect.anything()],
  },
  {
    tool: "force_release_claim",
    scope: "task:write",
    args: { taskId },
    method: "releaseTask",
    expect: [taskId, true, expect.anything()],
  },
  {
    tool: "approve_task",
    scope: "task:write",
    args: { taskId },
    method: "updateTask",
    expect: [taskId, { status: "approved" }, expect.anything()],
  },
  {
    tool: "cancel_task",
    scope: "task:write",
    args: { taskId },
    method: "updateTask",
    expect: [taskId, { status: "cancelled" }, expect.anything()],
  },
  {
    tool: "update_task",
    scope: "task:write",
    args: { taskId, status: "claimed", priority: 5 },
    method: "updateTask",
    expect: [taskId, { status: "claimed", priority: 5 }, expect.anything()],
  },
  {
    tool: "comment_task",
    scope: "task:write",
    args: { taskId, body: "A note" },
    method: "commentTask",
    expect: [taskId, "A note", expect.anything()],
  },
  {
    tool: "attach_task_link",
    scope: "task:write",
    args: { taskId, url: "https://example.test/issues/1", label: "Issue" },
    method: "attachTaskLink",
    expect: [taskId, "https://example.test/issues/1", "Issue", expect.anything()],
  },
  {
    tool: "link_task_article",
    scope: "task:write",
    args: { taskId, articleId },
    method: "linkTaskArticle",
    expect: [taskId, articleId, expect.anything()],
  },
];

describe("MCP tool surface", () => {
  it("exposes every documented tool", async () => {
    const client = await connect(stubService());
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    for (const { tool } of cases) expect(names).toContain(tool);
    expect(names).toContain("stage_write");
    expect(names).toContain("promote_staged_write");
    expect(names).toContain("import_markdown");
    expect(names).toContain("export_brain");
  });

  it.each(cases)("routes $tool to the service", async ({ tool, args, method, expect: args_ }) => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({ name: tool, arguments: args });
    expect(response.isError).not.toBe(true);
    if (args_) expect(service[method]).toHaveBeenCalledWith(...args_);
    else expect(service[method]).toHaveBeenCalledOnce();
  });

  it.each(cases)(
    "refuses $tool without the $scope scope",
    async ({ tool, scope, args, method }) => {
      const service = stubService();
      const granted = allAccessScopes.filter((value) => value !== scope).join(" ");
      const client = await connect(service, granted);
      const response = await client.callTool({ name: tool, arguments: args });
      expect(response).toMatchObject({ isError: true });
      expect(JSON.stringify(response.content)).toContain(scope);
      expect(service[method]).not.toHaveBeenCalled();
    },
  );
});

describe("staged writes over MCP", () => {
  const stageArgs = {
    brainId,
    operation: "create",
    slug: "architecture",
    title: "Architecture",
    body: "The canonical body.",
    changeSummary: "Create the architecture memory",
  };

  it("never returns the encrypted staged body to a client", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({ name: "stage_write", arguments: stageArgs });
    expect(response.structuredContent).toEqual({ id: writeId, status: "pending" });
  });

  it("promotes a write and reports the resulting version", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({
      name: "promote_staged_write",
      arguments: { writeId, decision: "promote", decisionSummary: "Reviewed and correct" },
    });
    expect(service.promoteWrite).toHaveBeenCalledWith(
      expect.objectContaining({ writeId, decision: "promote" }),
      expect.anything(),
    );
    expect(response.structuredContent).toMatchObject({ version: { version: 3 } });
  });

  it("reports a rejected argument as a tool error rather than a crash", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({
      name: "stage_write",
      arguments: { ...stageArgs, brainId: "not-a-uuid" },
    });
    expect(response).toMatchObject({ isError: true });
    expect(service.stageWrite).not.toHaveBeenCalled();
  });
});

describe("import_markdown", () => {
  it("updates an existing slug and creates a new one in the same batch", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({
      name: "import_markdown",
      arguments: {
        brainId,
        documents: [
          { path: "docs/architecture.md", title: "Architecture", body: "Updated body." },
          { path: "docs/glossary.md", title: "Glossary", body: "New body." },
        ],
      },
    });
    expect(response.isError).not.toBe(true);
    const calls = vi.mocked(service.stageWrite).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toMatchObject({
      operation: "update",
      articleId,
      baseVersion: 2,
      slug: "architecture",
      changeSummary: "import: docs/architecture.md",
      acknowledgePotentialConflicts: true,
    });
    expect(calls[1]?.[0]).toMatchObject({
      operation: "create",
      slug: "glossary",
      changeSummary: "import: docs/glossary.md",
    });
    expect(calls[0]?.[0].articleId).not.toBe(calls[1]?.[0].articleId);
  });

  it("gives each document a stable idempotency key", async () => {
    const service = stubService();
    const client = await connect(service);
    const document = { path: "docs/glossary.md", title: "Glossary", body: "New body." };
    await client.callTool({
      name: "import_markdown",
      arguments: { brainId, documents: [document] },
    });
    await client.callTool({
      name: "import_markdown",
      arguments: { brainId, documents: [document] },
    });
    const [first, second] = vi.mocked(service.stageWrite).mock.calls;
    expect(first?.[0].idempotencyKey).toBe(second?.[0].idempotencyKey);
  });
});

describe("export_brain", () => {
  it("returns one file per article with its version", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({ name: "export_brain", arguments: { brainId } });
    expect(response.structuredContent).toEqual({
      brain: { id: brainId, slug: "product" },
      files: [{ path: "architecture.md", version: 2, content: "# Architecture\n" }],
      truncated: false,
    });
  });

  it("flags a truncated export when the limit is reached", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({
      name: "export_brain",
      arguments: { brainId, limit: 1 },
    });
    expect(response.structuredContent).toMatchObject({ truncated: true });
  });

  it("refuses an export for anyone but the brain owner", async () => {
    const service = stubService();
    const client = await connect(service, allAccessScopes.join(" "), "editor");
    const response = await client.callTool({ name: "export_brain", arguments: { brainId } });
    expect(response).toMatchObject({ isError: true });
    expect(service.getBrain).not.toHaveBeenCalled();
  });
});

describe("sanitize", () => {
  it("removes ciphertext and secrets at any depth", () => {
    expect(
      sanitize({
        id: "write-id",
        body: Buffer.from("ciphertext"),
        bodyAad: "brain:x:article:y:version:1",
        user: { passwordHash: "$argon2id$", email: "person@example.test" },
        brain: { wrappedKey: { ciphertext: "..." }, slug: "product" },
        writes: [{ body: Buffer.from("ciphertext"), id: "nested" }],
      }),
    ).toEqual({
      id: "write-id",
      user: { email: "person@example.test" },
      brain: { slug: "product" },
      writes: [{ id: "nested" }],
    });
  });

  it("renders dates as ISO strings and leaves primitives alone", () => {
    expect(sanitize(new Date("2026-01-15T12:00:00.000Z"))).toBe("2026-01-15T12:00:00.000Z");
    expect(sanitize(null)).toBeNull();
    expect(sanitize(7)).toBe(7);
    expect(sanitize("plain")).toBe("plain");
  });
});
