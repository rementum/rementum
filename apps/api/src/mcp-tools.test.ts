import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { toolNames } from "@rementum/contracts";
import { ConflictError, type RementumService } from "@rementum/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allAccessScopes, withAccessScopes } from "./access.js";
import { createMcpServer, sanitize } from "./mcp.js";

const brainId = "00000000-0000-4000-8000-000000000001";
const articleId = "00000000-0000-4000-8000-000000000002";
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
    stageWrite: vi.fn(async () => ({ id: writeId, status: "pending", body: Buffer.from("x") })),
    promoteWrite: vi.fn(async () => ({ version: { version: 3 } })),
    recordMcpToolCall: vi.fn(async () => undefined),
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
      systemOwner: false,
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
    tool: "create_brain",
    scope: "brain:write",
    args: { name: "New brain", slug: "new-brain", workspaceId },
    method: "createBrain",
  },
  {
    tool: "load_context",
    scope: "brain:read",
    args: { brainId, query: "architecture" },
    method: "search",
  },
  {
    tool: "stage_write",
    scope: "brain:write",
    method: "stageWrite",
    args: {
      brainId,
      operation: "create",
      slug: "architecture",
      title: "Architecture",
      body: "Body",
      changeSummary: "Create",
    },
  },
  {
    tool: "promote_staged_write",
    scope: "brain:write",
    method: "promoteWrite",
    args: { writeId, decisionSummary: "Reviewed" },
  },
];

const toolsByScope = {
  "brain:read": ["search_brains", "get_brain", "load_context", "read_article"],
  "brain:write": ["create_brain", "stage_write", "promote_staged_write"],
  "task:read": [],
  "task:write": [],
} as const;

const catalogBudgets = {
  "brain:read": 4_000,
  "brain:write": 6_000,
  "task:read": 100,
  "task:write": 100,
} as const;

describe("MCP tool surface", () => {
  it("exposes exactly the seven memory tools", async () => {
    const client = await connect(stubService());
    const catalog = await client.listTools();
    expect(catalog.tools.map((tool) => tool.name)).toEqual([
      "search_brains",
      "create_brain",
      "get_brain",
      "load_context",
      "read_article",
      "stage_write",
      "promote_staged_write",
    ]);
    expect(catalog.tools.map((tool) => tool.name)).toEqual([...toolNames]);
    expect(JSON.stringify(catalog).length).toBeLessThanOrEqual(10_000);
  });

  it.each([
    "list_brains",
    "search_articles",
    "recent_activity",
    "withdraw_staged_write",
    "get_write_status",
    "verify_article",
    "set_article_links",
    "import_markdown",
    "export_brain",
    "list_tasks",
    "get_task",
    "create_task",
    "claim_next_task",
    "claim_task",
    "heartbeat_claim",
    "release_claim",
    "force_release_claim",
    "update_task",
    "approve_task",
    "cancel_task",
    "comment_task",
    "attach_task_link",
    "link_task_article",
    "propose_invite",
    "scan_brain",
    "list_maintenance_candidates",
  ])("refuses retired tool %s even with all scopes", async (name) => {
    const service = stubService();
    const client = await connect(service);
    await expect(client.callTool({ name, arguments: {} })).rejects.toThrow(
      `Tool ${name} not found`,
    );
    expect(service.recordMcpToolCall).not.toHaveBeenCalled();
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

  it.each([
    { version: 1, kind: "routing", resourceId: workspaceId, offset: 1 },
    { version: 1, kind: "activity", resourceId: brainId, offset: 1 },
    { version: 1, kind: "routing", resourceId: brainId, offset: -1 },
  ])("rejects an invalid or foreign routing cursor: %j", async (cursor) => {
    const service = stubService();
    const client = await connect(service);
    const response = await client.callTool({
      name: "get_brain",
      arguments: { brainId, cursor: Buffer.from(JSON.stringify(cursor)).toString("base64url") },
    });
    expect(response).toMatchObject({ isError: true });
    expect(service.getBrain).not.toHaveBeenCalled();
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

  it("returns minified text that matches structured content", async () => {
    const client = await connect(stubService());
    const response = await client.callTool({ name: "read_article", arguments: { articleId } });
    const textBlock = contentBlocks(response).find((block) => block.type === "text");
    const text = typeof textBlock?.text === "string" ? textBlock.text : undefined;
    expect(text).not.toContain("\n  ");
    expect(JSON.parse(text ?? "")).toEqual(response.structuredContent);
  });
});

describe("MCP usage tracking", () => {
  it("records one successful direct article read with safe dimensions", async () => {
    const recordMcpToolCall = vi.fn(async () => undefined);
    const client = await connect(stubService({ recordMcpToolCall }));

    await client.callTool({ name: "read_article", arguments: { articleId } });

    expect(recordMcpToolCall).toHaveBeenCalledTimes(1);
    expect(recordMcpToolCall).toHaveBeenCalledWith(
      {
        workspaceId,
        tool: "read_article",
        brainId,
        articleId,
        articleIds: [articleId],
      },
      expect.objectContaining({ clientId: "test-client", workspaceId }),
    );
  });

  it("does not record failed calls", async () => {
    const recordMcpToolCall = vi.fn(async () => undefined);
    const client = await connect(
      stubService({
        readArticle: vi.fn(async () => {
          throw new Error("read failed");
        }),
        recordMcpToolCall,
      }),
    );

    const response = await client.callTool({ name: "read_article", arguments: { articleId } });

    expect(response).toMatchObject({ isError: true });
    expect(recordMcpToolCall).not.toHaveBeenCalled();
  });

  it("keeps a successful tool response when usage persistence fails", async () => {
    const client = await connect(
      stubService({
        recordMcpToolCall: vi.fn(async () => {
          throw new Error("analytics unavailable");
        }),
      }),
    );

    const response = await client.callTool({ name: "read_article", arguments: { articleId } });

    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({ id: articleId, body: "# Architecture\n" });
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
    const recordMcpToolCall = vi.fn(async () => undefined);
    const client = await connect(stubService({ search, readArticle, recordMcpToolCall }));
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
    expect(recordMcpToolCall).toHaveBeenCalledWith(
      {
        workspaceId,
        tool: "load_context",
        brainId,
        articleIds: [firstId, secondId],
      },
      expect.anything(),
    );
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

  it("charges maxChars for the text block publicResult duplicates", async () => {
    const hits = [searchHit(firstId, "first", 0.9), searchHit(secondId, "second", 0.8)];
    const readArticle = vi.fn(async (id: string) =>
      articleResult(id, id === firstId ? "first" : "second", `# Body\n${"x".repeat(900)}`),
    );
    const client = await connect(stubService({ search: vi.fn(async () => hits), readArticle }));
    const response = await client.callTool({
      name: "load_context",
      arguments: { brainId, query: "budget", maxArticles: 2, maxChars: 4000 },
    });
    // The whole result, not just structuredContent: the same payload rides along JSON-escaped
    // inside content[0].text, and a budget that ignored it delivered roughly double.
    expect(JSON.stringify(response).length).toBeLessThanOrEqual(4000);
  });

  it("stops opening candidates once the read allowance is spent", async () => {
    const ids = Array.from(
      { length: 9 },
      (_, index) => `00000000-0000-4000-8000-00000000001${index}`,
    );
    const hits = ids.map((id, index) => searchHit(id, `article-${index}`, 1 - index / 100));
    // Every body overflows the budget, so nothing is ever added and only the allowance stops us.
    const readArticle = vi.fn(async (id: string) =>
      articleResult(id, "oversized", `# Oversized\n${"x".repeat(9000)}`),
    );
    const client = await connect(stubService({ search: vi.fn(async () => hits), readArticle }));
    const response = await client.callTool({
      name: "load_context",
      arguments: { brainId, query: "expensive", maxArticles: 3, maxChars: 4000 },
    });
    // maxArticles * 2, not the full candidate list: each open costs a decrypt and an audit row.
    expect(readArticle).toHaveBeenCalledTimes(6);
    const result = structuredResult(response);
    expect(result.articles).toEqual([]);
    expect(result.omittedCount).toBe(9);
    const omitted = Array.isArray(result.omitted) ? result.omitted : [];
    expect(omitted.some((entry) => entry.reason === "read_budget")).toBe(true);
    expect(result.hasMore).toBe(true);
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

describe("tool failures", () => {
  it("reports a domain failure with its code and detail", async () => {
    const service = stubService({
      stageWrite: vi.fn(async () => {
        throw new ConflictError("Potentially conflicting articles must be acknowledged", {
          potentialConflicts: [{ articleId, slug: "architecture", similarity: 0.9 }],
        });
      }),
    });
    const client = await connect(service);
    const response = await client.callTool({
      name: "stage_write",
      arguments: {
        brainId,
        operation: "create",
        slug: "new-article",
        title: "New article",
        body: "Body",
        changeSummary: "create",
      },
    });
    expect(response).toMatchObject({ isError: true });
    const content = (response as { content: Array<{ type: string; text: string }> }).content;
    expect(JSON.parse(content[0]?.text ?? "{}")).toEqual({
      code: "conflict",
      message: "Potentially conflicting articles must be acknowledged",
      detail: { potentialConflicts: [{ articleId, slug: "architecture", similarity: 0.9 }] },
    });
  });

  it("hides internal failures from the client and hands them to the logger", async () => {
    const onToolError = vi.fn();
    const service = stubService({
      readArticle: vi.fn(async () => {
        throw new Error('connect ECONNREFUSED postgres:5432 for table "article_versions"');
      }),
    });
    const actor = withAccessScopes(
      {
        userId: "00000000-0000-4000-8000-000000000009",
        clientId: "test-client",
        systemOwner: false,
        teamRoles: new Map(),
        workspaceRoles: new Map([[workspaceId, "owner"]]),
        brainRoles: new Map([[brainId, "owner"]]),
      },
      allAccessScopes.join(" "),
      workspaceId,
    );
    const server = createMcpServer(
      service,
      actor,
      "https://rementum.example.test",
      undefined,
      onToolError,
    );
    const client = new Client({ name: "failure-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    open.push({ client, server });

    const response = await client.callTool({ name: "read_article", arguments: { articleId } });
    expect(response).toMatchObject({ isError: true });
    const text = (response as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).not.toContain("ECONNREFUSED");
    expect(JSON.parse(text)).toEqual({ code: "internal", message: "Internal server error" });
    expect(onToolError).toHaveBeenCalledWith(expect.any(Error), "read_article");
  });
});
