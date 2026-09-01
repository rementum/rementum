import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { RementumService } from "@rementum/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allAccessScopes, withAccessScopes } from "./access.js";
import { createMcpServer, sanitize } from "./mcp.js";

const brainId = "00000000-0000-4000-8000-000000000001";
const articleId = "00000000-0000-4000-8000-000000000002";
const taskId = "00000000-0000-4000-8000-000000000003";
const writeId = "00000000-0000-4000-8000-000000000004";
const workspaceId = "00000000-0000-4000-8000-000000000005";

function articleResult(id = articleId, slug = "architecture", body = "# Architecture\n") {
  return {
    id,
    brainId,
    slug,
    title: slug === "architecture" ? "Architecture" : slug,
    summary: `${slug} summary.`,
    keywords: [slug],
    kind: "canonical" as const,
    freshness: "current" as const,
    currentVersion: 2,
    updatedAt: "2026-01-02T00:00:00.000Z",
    body,
    links: [{ articleId, slug: "architecture", relation: "related" }],
    sources: [],
    verifiedAt: null,
    reviewAfter: null,
    compaction: {
      enabled: false,
      available: false,
      status: "not_requested" as const,
      attempts: 0,
      error: null,
      compactedAt: null,
      canRetry: false,
    },
    provenance: {
      actorId: "00000000-0000-4000-8000-000000000009",
      clientId: "test-client",
      changeSummary: "Create article",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  };
}

function searchHit(id: string, slug: string, score: number) {
  return {
    article: {
      id,
      brainId,
      slug,
      title: slug,
      summary: `${slug} summary.`,
      keywords: [slug],
      kind: "canonical" as const,
      freshness: "current" as const,
      currentVersion: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    score,
    sources: ["routing", "vector"],
    excerpt: `${slug} summary.`,
  };
}

const open: Array<{ client: Client; server: ReturnType<typeof createMcpServer> }> = [];

afterEach(async () => {
  await Promise.all(
    open.splice(0).map(({ client, server }) => Promise.all([client.close(), server.close()])),
  );
});

function stubService(overrides: Record<string, unknown> = {}): RementumService {
  return {
    listBrains: vi.fn(async () => ({ items: [], total: 0 })),
    searchBrains: vi.fn(async () => []),
    createBrain: vi.fn(async () => ({ brain: { id: brainId }, routingIndex: [], articleTotal: 0 })),
    getBrain: vi.fn(async () => ({
      brain: {
        id: brainId,
        workspaceId,
        slug: "product",
        name: "Product",
        description: "Product knowledge",
        instructions: "Read relevant architecture first.",
        createdBy: "00000000-0000-4000-8000-000000000009",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      routingIndex: [
        {
          id: articleId,
          brainId,
          slug: "architecture",
          title: "Architecture",
          summary: "System design.",
          keywords: ["architecture"],
          kind: "canonical",
          freshness: "current",
          currentVersion: 2,
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      articleTotal: 1,
      role: "owner",
    })),
    search: vi.fn(async () => []),
    readArticle: vi.fn(async () => articleResult()),
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
  const server = createMcpServer(service, actor, "https://rementum.example.test");
  const client = new Client({ name: "tool-surface-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  open.push({ client, server });
  return client;
}

function structuredResult(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object") throw new Error("Expected an MCP result");
  const value = (response as Record<string, unknown>).structuredContent;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object structuredContent result");
  }
  return value as Record<string, unknown>;
}

function contentBlocks(response: unknown): Array<Record<string, unknown>> {
  if (!response || typeof response !== "object") throw new Error("Expected an MCP result");
  const content = (response as Record<string, unknown>).content;
  if (!Array.isArray(content)) throw new Error("Expected MCP content blocks");
  return content.filter(
    (block): block is Record<string, unknown> => !!block && typeof block === "object",
  );
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
    expect: [brainId, expect.anything(), 25, "updated", 0],
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
    expect: [brainId, 11, expect.anything(), undefined, 0],
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
    expect: [brainId, expect.anything(), { limit: 21, offset: 0 }],
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

const toolsByScope = {
  "brain:read": [
    "list_brains",
    "search_brains",
    "get_brain",
    "search_articles",
    "load_context",
    "read_article",
    "recent_activity",
    "get_write_status",
    "export_brain",
    "list_maintenance_candidates",
  ],
  "brain:write": [
    "create_brain",
    "stage_write",
    "promote_staged_write",
    "withdraw_staged_write",
    "verify_article",
    "set_article_links",
    "import_markdown",
    "scan_brain",
    "propose_invite",
  ],
  "task:read": ["list_tasks", "get_task"],
  "task:write": [
    "create_task",
    "claim_task",
    "claim_next_task",
    "heartbeat_claim",
    "release_claim",
    "force_release_claim",
    "update_task",
    "approve_task",
    "cancel_task",
    "comment_task",
    "attach_task_link",
    "link_task_article",
  ],
} as const;

const catalogBudgets = {
  "brain:read": 8_000,
  "brain:write": 11_000,
  "task:read": 1_500,
  "task:write": 10_000,
} as const;

describe("MCP tool surface", () => {
  it("exposes every documented tool", async () => {
    const client = await connect(stubService());
    const catalog = await client.listTools();
    const names = catalog.tools.map((tool) => tool.name).sort();
    for (const { tool } of cases) expect(names).toContain(tool);
    expect(names).toContain("stage_write");
    expect(names).toContain("promote_staged_write");
    expect(names).toContain("import_markdown");
    expect(names).toContain("export_brain");
    expect(JSON.stringify(catalog).length).toBeLessThanOrEqual(28_000);
  });

  it.each(Object.entries(toolsByScope))(
    "advertises only deterministic %s tools within the catalog budget",
    async (scope, expectedNames) => {
      const client = await connect(stubService(), scope);
      const first = await client.listTools();
      const second = await client.listTools();
      expect(first.tools.map((tool) => tool.name)).toEqual(expectedNames);
      expect(second.tools.map((tool) => tool.name)).toEqual(expectedNames);
      expect(JSON.stringify(first).length).toBeLessThanOrEqual(
        catalogBudgets[scope as keyof typeof catalogBudgets],
      );
    },
  );

  it("keeps server guidance concise and security-relevant", async () => {
    const client = await connect(stubService(), "brain:read brain:write");
    const instructions = client.getInstructions();
    expect(instructions?.length).toBeLessThanOrEqual(260);
    expect(instructions).toContain("stage_write");
    expect(instructions).toContain("untrusted");
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
    "hides and refuses $tool without the $scope scope",
    async ({ tool, scope, args, method }) => {
      const service = stubService();
      const granted = allAccessScopes.filter((value) => value !== scope).join(" ");
      const client = await connect(service, granted);
      expect((await client.listTools()).tools.map((candidate) => candidate.name)).not.toContain(
        tool,
      );
      await expect(client.callTool({ name: tool, arguments: args })).rejects.toThrow(
        `Tool ${tool} not found`,
      );
      expect(service[method]).not.toHaveBeenCalled();
    },
  );
});

describe("compact MCP results", () => {
  it("paginates compact brain inventory records", async () => {
    const brains = [
      {
        id: brainId,
        workspaceId,
        slug: "product",
        name: "Product",
        description: "Product knowledge",
        instructions: "Private routing instructions",
        createdBy: "00000000-0000-4000-8000-000000000009",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        id: "00000000-0000-4000-8000-000000000006",
        workspaceId,
        slug: "operations",
        name: "Operations",
        description: "Operations knowledge",
        instructions: "More private routing instructions",
        createdBy: "00000000-0000-4000-8000-000000000009",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ];
    const listBrains = vi.fn(async (_actor, options: { limit: number; offset: number }) => ({
      items: brains.slice(options.offset, options.offset + options.limit),
      total: brains.length,
    }));
    const client = await connect(stubService({ listBrains }));
    const first = await client.callTool({ name: "list_brains", arguments: { limit: 1 } });
    expect(first.structuredContent).toMatchObject({
      items: [{ id: brainId, slug: "product", name: "Product" }],
      total: 2,
      hasMore: true,
    });
    const firstResult = structuredResult(first);
    const items = firstResult.items;
    expect(Array.isArray(items) ? items[0] : undefined).not.toHaveProperty("workspaceId");
    if (typeof firstResult.nextCursor !== "string") throw new Error("Expected a brain cursor");

    const second = await client.callTool({
      name: "list_brains",
      arguments: { limit: 1, cursor: firstResult.nextCursor },
    });
    expect(second.structuredContent).toMatchObject({
      items: [{ slug: "operations" }],
      hasMore: false,
      nextCursor: null,
    });
    expect(listBrains.mock.calls.map((call) => call[1].offset)).toEqual([0, 1]);
  });

  it("paginates and projects the brain routing index with an opaque cursor", async () => {
    const secondArticleId = "00000000-0000-4000-8000-000000000006";
    const summaries = [
      {
        id: articleId,
        brainId,
        slug: "architecture",
        title: "Architecture",
        summary: "System design.",
        keywords: ["architecture"],
        kind: "canonical" as const,
        freshness: "current" as const,
        currentVersion: 2,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: secondArticleId,
        brainId,
        slug: "operations",
        title: "Operations",
        summary: "Runtime operations.",
        keywords: ["operations"],
        kind: "canonical" as const,
        freshness: "unknown" as const,
        currentVersion: 1,
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
    ];
    const getBrain = vi.fn(async (_brainId, _actor, limit: number, _sort, offset: number) => ({
      brain: {
        id: brainId,
        workspaceId,
        slug: "product",
        name: "Product",
        description: "Product knowledge",
        instructions: "Read relevant architecture first.",
        createdBy: "00000000-0000-4000-8000-000000000009",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      routingIndex: summaries.slice(offset, offset + limit),
      articleTotal: summaries.length,
      role: "owner" as const,
    }));
    const client = await connect(stubService({ getBrain }));

    const first = await client.callTool({
      name: "get_brain",
      arguments: { brainId, limit: 1 },
    });
    expect(first.structuredContent).toMatchObject({
      brain: { id: brainId, slug: "product", name: "Product" },
      routingIndex: [{ id: articleId, slug: "architecture", currentVersion: 2 }],
      articleTotal: 2,
      hasMore: true,
    });
    const firstResult = structuredResult(first);
    expect(firstResult.brain).not.toHaveProperty("workspaceId");
    const routingIndex = firstResult.routingIndex;
    expect(Array.isArray(routingIndex) ? routingIndex[0] : undefined).not.toHaveProperty("brainId");
    if (typeof firstResult.nextCursor !== "string") throw new Error("Expected a routing cursor");

    const wrongBrain = await client.callTool({
      name: "get_brain",
      arguments: {
        brainId: "00000000-0000-4000-8000-000000000009",
        limit: 1,
        cursor: firstResult.nextCursor,
      },
    });
    expect(wrongBrain).toMatchObject({ isError: true });

    const second = await client.callTool({
      name: "get_brain",
      arguments: { brainId, limit: 1, cursor: firstResult.nextCursor },
    });
    expect(second.structuredContent).toMatchObject({
      routingIndex: [{ id: secondArticleId, slug: "operations" }],
      hasMore: false,
      nextCursor: null,
    });
    expect(getBrain.mock.calls.map((call) => call[4])).toEqual([0, 1]);
  });

  it("rejects a cursor from another tool before reading the service", async () => {
    const events = [
      {
        id: "00000000-0000-4000-8000-000000000006",
        action: "article.updated",
        resource: `article:${articleId}`,
        actorId: "00000000-0000-4000-8000-000000000009",
        clientId: "agent-client",
        detail: { version: 2 },
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000007",
        action: "article.read",
        resource: `article:${articleId}`,
        actorId: "00000000-0000-4000-8000-000000000009",
        clientId: "agent-client",
        detail: { version: 1 },
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const recentActivity = vi.fn(async (_brainId, limit: number, _actor, _source, offset: number) =>
      events.slice(offset, offset + limit),
    );
    const service = stubService({ recentActivity });
    const client = await connect(service);
    const activity = await client.callTool({
      name: "recent_activity",
      arguments: { brainId, limit: 1 },
    });
    expect(activity.structuredContent).toMatchObject({
      items: [
        {
          action: "article.updated",
          resource: `article:${articleId}`,
          detail: { version: 2 },
        },
      ],
      hasMore: true,
    });
    const activityResult = structuredResult(activity);
    const activityItems = activityResult.items;
    expect(Array.isArray(activityItems) ? activityItems[0] : undefined).not.toHaveProperty(
      "actorId",
    );
    if (typeof activityResult.nextCursor !== "string") throw new Error("Expected activity cursor");
    const response = await client.callTool({
      name: "get_brain",
      arguments: { brainId, cursor: activityResult.nextCursor },
    });
    expect(response).toMatchObject({ isError: true });
    expect(service.getBrain).not.toHaveBeenCalled();
  });

  it("returns flat search hits without duplicate excerpts or parent ids", async () => {
    const service = stubService({
      search: vi.fn(async () => [
        {
          article: {
            id: articleId,
            brainId,
            slug: "architecture",
            title: "Architecture",
            summary: "System design.",
            keywords: ["architecture"],
            kind: "canonical",
            freshness: "current",
            currentVersion: 2,
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
          score: 0.5,
          sources: ["routing", "vector"],
          excerpt: "System design.",
        },
      ]),
    });
    const client = await connect(service);
    const response = await client.callTool({
      name: "search_articles",
      arguments: { brainId, query: "architecture" },
    });
    expect(response.structuredContent).toEqual({
      items: [
        {
          id: articleId,
          slug: "architecture",
          title: "Architecture",
          summary: "System design.",
          keywords: ["architecture"],
          kind: "canonical",
          freshness: "current",
          currentVersion: 2,
          score: 0.5,
          sources: ["routing", "vector"],
        },
      ],
    });
  });

  it("defaults read_article to a body view and keeps full detail opt-in", async () => {
    const client = await connect(stubService());
    const body = await client.callTool({ name: "read_article", arguments: { articleId } });
    expect(body.structuredContent).toMatchObject({
      id: articleId,
      brainId,
      slug: "architecture",
      currentVersion: 2,
      body: "# Architecture\n",
    });
    expect(body.structuredContent).not.toHaveProperty("links");
    expect(body.structuredContent).not.toHaveProperty("provenance");

    const full = await client.callTool({
      name: "read_article",
      arguments: { articleId, detail: "full" },
    });
    expect(full.structuredContent).toHaveProperty("links");
    expect(full.structuredContent).toHaveProperty("provenance");
  });

  it("paginates task summaries without returning full briefs", async () => {
    const tasks = [
      {
        id: taskId,
        brainId,
        title: "First task",
        brief: "A long private brief",
        priority: 10,
        status: "open" as const,
        claimedBy: null,
        leaseExpiresAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000006",
        brainId,
        title: "Second task",
        brief: "Another long private brief",
        priority: 5,
        status: "open" as const,
        claimedBy: null,
        leaseExpiresAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const listTasks = vi.fn(async (_brainId, _actor, page) =>
      tasks.slice(page.offset, page.offset + page.limit),
    );
    const client = await connect(stubService({ listTasks }));
    const response = await client.callTool({
      name: "list_tasks",
      arguments: { brainId, limit: 1 },
    });
    expect(response.structuredContent).toMatchObject({
      items: [{ id: taskId, title: "First task", priority: 10 }],
      hasMore: true,
    });
    const taskItems = structuredResult(response).items;
    expect(Array.isArray(taskItems) ? taskItems[0] : undefined).not.toHaveProperty("brief");
    expect(listTasks).toHaveBeenCalledWith(brainId, expect.anything(), { limit: 2, offset: 0 });
  });

  it("paginates compact maintenance findings", async () => {
    const candidates = [
      {
        id: "00000000-0000-4000-8000-000000000006",
        brainId,
        kind: "stale" as const,
        articleIds: [articleId],
        score: null,
        detail: { reason: "review due" },
        status: "open" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000007",
        brainId,
        kind: "oversized" as const,
        articleIds: [articleId],
        score: null,
        detail: { bytes: 50_000 },
        status: "open" as const,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const listMaintenance = vi.fn(async (_brainId, _actor, page) =>
      candidates.slice(page.offset, page.offset + page.limit),
    );
    const client = await connect(stubService({ listMaintenance }));
    const response = await client.callTool({
      name: "list_maintenance_candidates",
      arguments: { brainId, limit: 1 },
    });
    expect(response.structuredContent).toMatchObject({
      items: [{ kind: "stale", articleIds: [articleId] }],
      hasMore: true,
    });
    const maintenanceItems = structuredResult(response).items;
    expect(Array.isArray(maintenanceItems) ? maintenanceItems[0] : undefined).not.toHaveProperty(
      "brainId",
    );
    expect(listMaintenance).toHaveBeenCalledWith(brainId, expect.anything(), {
      limit: 2,
      offset: 0,
    });
  });

  it("returns minified text that matches structured content", async () => {
    const client = await connect(stubService());
    const response = await client.callTool({ name: "read_article", arguments: { articleId } });
    const textBlock = contentBlocks(response).find((block) => block.type === "text");
    const text = typeof textBlock?.text === "string" ? textBlock.text : undefined;
    expect(text).not.toContain("\n  ");
    expect(JSON.parse(text ?? "")).toEqual(response.structuredContent);
  });
});

describe("load_context", () => {
  const firstId = "00000000-0000-4000-8000-000000000006";
  const secondId = "00000000-0000-4000-8000-000000000007";
  const thirdId = "00000000-0000-4000-8000-000000000008";

  it("preserves hybrid rank while respecting the article limit", async () => {
    const hits = [
      searchHit(firstId, "first", 0.9),
      searchHit(secondId, "second", 0.8),
      searchHit(thirdId, "third", 0.7),
    ];
    const search = vi.fn(async () => hits);
    const readArticle = vi.fn(async (id: string) => {
      const hit = hits.find((candidate) => candidate.article.id === id);
      if (!hit) throw new Error("Unknown article");
      return articleResult(id, hit.article.slug, `# ${hit.article.slug}\n${"x".repeat(500)}`);
    });
    const client = await connect(stubService({ search, readArticle }));
    const response = await client.callTool({
      name: "load_context",
      arguments: { brainId, query: "ranked context", maxArticles: 2, maxChars: 100_000 },
    });
    expect(response.structuredContent).toMatchObject({
      brainId,
      articles: [
        { id: firstId, slug: "first", score: 0.9 },
        { id: secondId, slug: "second", score: 0.8 },
      ],
      omitted: [{ id: thirdId, slug: "third", reason: "article_limit" }],
      omittedCount: 1,
      candidateCount: 3,
      searchTruncated: false,
      hasMore: true,
    });
    const result = structuredResult(response);
    const articles = result.articles;
    expect(Array.isArray(articles) ? articles.map((article) => article.body) : []).toEqual([
      `# first\n${"x".repeat(500)}`,
      `# second\n${"x".repeat(500)}`,
    ]);
    expect(readArticle.mock.calls.map((call) => call[0])).toEqual([firstId, secondId]);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ brainId, query: "ranked context", limit: 6 }),
      expect.anything(),
    );
    expect(JSON.stringify(response.structuredContent).length).toBeLessThanOrEqual(100_000);
  });

  it("skips oversized bodies without truncating articles that fit", async () => {
    const hits = [searchHit(firstId, "oversized", 0.9), searchHit(secondId, "fits", 0.8)];
    const fittingBody = `# Fits\n${"y".repeat(500)}`;
    const readArticle = vi.fn(async (id: string) =>
      id === firstId
        ? articleResult(id, "oversized", `# Oversized\n${"x".repeat(5000)}`)
        : articleResult(id, "fits", fittingBody),
    );
    const client = await connect(stubService({ search: vi.fn(async () => hits), readArticle }));
    const response = await client.callTool({
      name: "load_context",
      arguments: { brainId, query: "bounded context", maxArticles: 2, maxChars: 4000 },
    });
    expect(response.structuredContent).toMatchObject({
      articles: [{ id: secondId, slug: "fits", body: fittingBody }],
      omitted: [{ id: firstId, slug: "oversized", reason: "character_budget" }],
      omittedCount: 1,
      hasMore: true,
    });
    expect(JSON.stringify(response.structuredContent).length).toBeLessThanOrEqual(4000);
  });

  it("is hidden and blocked without brain read scope", async () => {
    const service = stubService();
    const client = await connect(service, "brain:write");
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain("load_context");
    await expect(
      client.callTool({
        name: "load_context",
        arguments: { brainId, query: "blocked" },
      }),
    ).rejects.toThrow("Tool load_context not found");
    expect(service.search).not.toHaveBeenCalled();
  });
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

  it("returns the decrypted article body from read_article", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({ name: "read_article", arguments: { articleId } });
    expect(response.structuredContent).toMatchObject({
      id: articleId,
      slug: "architecture",
      body: "# Architecture\n",
    });
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
  it("returns a REST resource link without placing article bodies in context", async () => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({ name: "export_brain", arguments: { brainId } });
    expect(response.structuredContent).toEqual({
      brain: { id: brainId, slug: "product", name: "Product" },
      downloadUrl: `https://rementum.example.test/api/v1/brains/${brainId}/export`,
      format: "rementum-export-v1",
    });
    expect(response.content).toContainEqual({
      type: "resource_link",
      uri: `https://rementum.example.test/api/v1/brains/${brainId}/export`,
      name: "product-export.zip",
      description: "Open in a browser with an active Rementum session to download the ZIP export.",
      mimeType: "application/zip",
    });
    expect(service.getBrain).toHaveBeenCalledWith(brainId, expect.anything(), 1);
    expect(service.readArticle).not.toHaveBeenCalled();
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

  it("drops cipher envelopes on body but keeps decrypted plaintext", () => {
    expect(
      sanitize({
        id: "write-id",
        body: { version: 1, nonce: "n", ciphertext: "c", tag: "t" },
      }),
    ).toEqual({ id: "write-id" });
    expect(
      sanitize({
        id: articleId,
        slug: "architecture",
        body: "# Architecture\n\nEncrypted at rest.\n",
      }),
    ).toEqual({
      id: articleId,
      slug: "architecture",
      body: "# Architecture\n\nEncrypted at rest.\n",
    });
  });

  it("renders dates as ISO strings and leaves primitives alone", () => {
    expect(sanitize({ kept: true, omitted: undefined })).toEqual({ kept: true });
    expect(sanitize(new Date("2026-01-15T12:00:00.000Z"))).toBe("2026-01-15T12:00:00.000Z");
    expect(sanitize(null)).toBeNull();
    expect(sanitize(7)).toBe(7);
    expect(sanitize("plain")).toBe("plain");
  });
});
