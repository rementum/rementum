import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  claimTaskSchema,
  createBrainSchema,
  createTaskSchema,
  externalUrlSchema,
  promoteWriteSchema,
  searchArticlesSchema,
  stageWriteSchema,
  taskStatusSchema,
} from "@rementum/contracts";
import { DomainError, hashContent, type RementumService, slugify } from "@rementum/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type AccessScope, requireAccessScope, type ScopedActor } from "./access.js";

type Authenticate = (request: any) => Promise<ScopedActor>;

export async function registerWorkspaceMcpEndpoint(
  app: FastifyInstance,
  service: RementumService,
  authenticate: Authenticate,
  publicUrl: string,
): Promise<void> {
  registerMcpRoute(app, "/mcp/workspace/:workspaceId", service, authenticate, (request) => {
    const { workspaceId } = z.object({ workspaceId: z.uuid() }).parse(request.params);
    return `${publicUrl}/.well-known/oauth-protected-resource/mcp/workspace/${workspaceId}`;
  });
}

function registerMcpRoute(
  app: FastifyInstance,
  path: string,
  service: RementumService,
  authenticate: Authenticate,
  resourceMetadataUrl: (request: any) => string,
): void {
  app.post(path, async (request, reply) => {
    const metadataUrl = resourceMetadataUrl(request);
    let actor: ScopedActor;
    try {
      actor = await authenticate(request);
    } catch (error) {
      const domain =
        error instanceof DomainError ? error : new DomainError("unauthorized", "Unauthorized", 401);
      reply.header("WWW-Authenticate", `Bearer resource_metadata="${metadataUrl}"`);
      return reply.code(domain.status).send({
        jsonrpc: "2.0",
        error: { code: -32001, message: domain.message },
        id: null,
      });
    }

    const server = createMcpServer(service, actor);
    const transport = new StreamableHTTPServerTransport({});
    try {
      await server.connect(transport as any);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      reply.hijack();
      reply.raw.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      request.log.error(error, "MCP request failed");
      if (!reply.raw.headersSent) {
        return reply.code(500).send({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = async (_request: unknown, reply: any) =>
    reply.code(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  app.get(path, methodNotAllowed);
  app.delete(path, methodNotAllowed);
}

export function createMcpServer(service: RementumService, actor: ScopedActor): McpServer {
  const server = new McpServer({ name: "rementum", version: "0.1.0" });
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const write = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };

  server.registerTool(
    "list_brains",
    {
      title: "List accessible brains",
      description: "Start here. Lists every Rementum brain visible to this connection.",
      inputSchema: {},
      annotations: read,
    },
    () => scoped(actor, "brain:read", () => result(service.listBrains(actor))),
  );

  server.registerTool(
    "create_brain",
    {
      title: "Create a brain",
      description:
        "Creates a personal or shared brain. Omit workspaceId when exactly one workspace is accessible.",
      inputSchema: createBrainSchema.shape,
      annotations: write,
    },
    (input) =>
      scoped(actor, "brain:write", () =>
        result(service.createBrain(createBrainSchema.parse(input), actor)),
      ),
  );

  server.registerTool(
    "get_brain",
    {
      title: "Read a brain routing index",
      description:
        "Reads brain instructions and the compact routing index. Use this before guessing article slugs.",
      inputSchema: { brainId: z.uuid(), limit: z.number().int().min(1).max(1000).default(200) },
      annotations: read,
    },
    ({ brainId, limit }) =>
      scoped(actor, "brain:read", () => result(service.getBrain(brainId, actor, limit))),
  );

  server.registerTool(
    "search_articles",
    {
      title: "Search articles",
      description:
        "Hybrid metadata and semantic search. Search only when the routing index is not sufficient; read a hit before relying on it.",
      inputSchema: searchArticlesSchema.shape,
      annotations: read,
    },
    (input) =>
      scoped(actor, "brain:read", () =>
        result(service.search(searchArticlesSchema.parse(input), actor)),
      ),
  );

  server.registerTool(
    "read_article",
    {
      title: "Read a full article",
      description:
        "Reads the current canonical body, version, freshness, and provenance of one article.",
      inputSchema: { articleId: z.uuid() },
      annotations: read,
    },
    ({ articleId }) =>
      scoped(actor, "brain:read", () => result(service.readArticle(articleId, actor))),
  );

  server.registerTool(
    "recent_activity",
    {
      title: "Read recent brain activity",
      description:
        "Returns the append-only record of recent reads, writes, task events, and maintenance actions.",
      inputSchema: { brainId: z.uuid(), limit: z.number().int().min(1).max(200).default(50) },
      annotations: read,
    },
    ({ brainId, limit }) =>
      scoped(actor, "brain:read", () => result(service.recentActivity(brainId, limit, actor))),
  );

  server.registerTool(
    "stage_write",
    {
      title: "Stage an article write",
      description:
        "Stages a create, full canonical update, or log append without calling an external LLM. Rementum preserves the submitted title and body and creates a local routing summary. Promotion may queue deferred compaction when the article's workspace enables it. Read the current article first and pass its version for edits.",
      inputSchema: stageWriteSchema.shape,
      annotations: write,
    },
    async (input) =>
      scoped(actor, "brain:write", async () =>
        publicResult(await service.stageWrite(stageWriteSchema.parse(input), actor)),
      ),
  );

  server.registerTool(
    "promote_staged_write",
    {
      title: "Promote a staged write",
      description:
        "Promotes a conflict-free write. A base-version mismatch parks it without changing canon; an override requires another actor.",
      inputSchema: promoteWriteSchema.shape,
      annotations: write,
    },
    async (input) =>
      scoped(actor, "brain:write", async () =>
        publicResult(await service.promoteWrite(promoteWriteSchema.parse(input), actor)),
      ),
  );

  server.registerTool(
    "withdraw_staged_write",
    {
      title: "Withdraw a staged write",
      description: "Withdraws a pending or conflicted proposal while keeping its audit trail.",
      inputSchema: { writeId: z.uuid() },
      annotations: { ...write, idempotentHint: true },
    },
    async ({ writeId }) =>
      scoped(actor, "brain:write", async () =>
        publicResult(await service.withdrawWrite(writeId, actor)),
      ),
  );

  server.registerTool(
    "get_write_status",
    {
      title: "Get staged write status",
      description:
        "Returns the current status, conflict candidates, and promoted version without exposing encrypted content.",
      inputSchema: { writeId: z.uuid() },
      annotations: read,
    },
    async ({ writeId }) =>
      scoped(actor, "brain:read", async () =>
        publicResult(await service.getWriteStatus(writeId, actor)),
      ),
  );

  server.registerTool(
    "verify_article",
    {
      title: "Verify article freshness",
      description: "Marks an article current and optionally sets its next review date.",
      inputSchema: { articleId: z.uuid(), reviewAfter: z.iso.datetime().nullable().default(null) },
      annotations: write,
    },
    ({ articleId, reviewAfter }) =>
      scoped(actor, "brain:write", () =>
        result(service.verifyArticle(articleId, reviewAfter ? new Date(reviewAfter) : null, actor)),
      ),
  );

  server.registerTool(
    "set_article_links",
    {
      title: "Replace article links",
      description: "Replaces the outgoing links of an article. Targets must be in the same brain.",
      inputSchema: {
        articleId: z.uuid(),
        links: z
          .array(
            z.object({
              toArticleId: z.uuid(),
              relation: z.string().min(1).max(80).default("related"),
            }),
          )
          .max(200),
      },
      annotations: write,
    },
    ({ articleId, links }) =>
      scoped(actor, "brain:write", () => result(service.setArticleLinks(articleId, links, actor))),
  );

  server.registerTool(
    "import_markdown",
    {
      title: "Stage Markdown documents",
      description:
        "Stages a reviewed batch of Markdown documents without calling an external LLM. Promotion may queue deferred compaction for workspaces that enable it. It never promotes the imported writes.",
      inputSchema: {
        brainId: z.uuid(),
        documents: z
          .array(
            z.object({
              path: z.string().min(1).max(1000),
              title: z.string().min(1).max(240),
              body: z.string().min(1).max(2_000_000),
              kind: z.enum(["canonical", "log"]).default("canonical"),
              keywords: z.array(z.string()).max(40).default([]),
            }),
          )
          .min(1)
          .max(50),
      },
      annotations: write,
    },
    async ({ brainId, documents }) => {
      requireAccessScope(actor, "brain:write");
      const index = (await service.getBrain(brainId, actor, 10_000)).routingIndex;
      const writes = [];
      for (const document of documents) {
        const slug = slugify(document.title);
        const existing = index.find((article) => article.slug === slug);
        writes.push(
          sanitize(
            await service.stageWrite(
              stageWriteSchema.parse({
                brainId,
                operation: existing ? "update" : "create",
                articleId: existing?.id,
                slug,
                title: document.title,
                body: document.body,
                kind: document.kind,
                keywords: document.keywords,
                baseVersion: existing?.currentVersion,
                changeSummary: `import: ${document.path}`,
                sources: [
                  {
                    kind: "import",
                    locator: document.path,
                    checksum: hashContent(document.body),
                    metadata: { role: "migrated_from" },
                  },
                ],
                acknowledgePotentialConflicts: true,
                idempotencyKey: `mcp-import-${hashContent(`${brainId}:${document.path}:${document.body}`).slice(0, 32)}`,
              }),
              actor,
            ),
          ),
        );
      }
      return publicResult({ writes });
    },
  );

  server.registerTool(
    "export_brain",
    {
      title: "Export brain as Markdown",
      description:
        "Owner-only portable Markdown export. For large brains prefer the REST ZIP endpoint.",
      inputSchema: { brainId: z.uuid(), limit: z.number().int().min(1).max(500).default(500) },
      annotations: read,
    },
    async ({ brainId, limit }) => {
      requireAccessScope(actor, "brain:read");
      if (actor.brainRoles.get(brainId) !== "owner")
        throw new DomainError("forbidden", "Only the brain owner can export", 403);
      const brain = await service.getBrain(brainId, actor, limit);
      const files = [];
      for (const summary of brain.routingIndex) {
        const article = await service.readArticle(summary.id, actor);
        files.push({
          path: `${article.slug}.md`,
          version: article.currentVersion,
          content: article.body,
        });
      }
      return publicResult({
        brain: brain.brain,
        files,
        truncated: brain.routingIndex.length === limit,
      });
    },
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List brain tasks",
      description: "Lists the agent coordination queue in priority order.",
      inputSchema: { brainId: z.uuid() },
      annotations: read,
    },
    ({ brainId }) => scoped(actor, "task:read", () => result(service.listTasks(brainId, actor))),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get a task",
      description: "Reads one task and its current lease state.",
      inputSchema: { taskId: z.uuid() },
      annotations: read,
    },
    ({ taskId }) => scoped(actor, "task:read", () => result(service.getTask(taskId, actor))),
  );

  server.registerTool(
    "create_task",
    {
      title: "Create a task",
      description: "Creates an auditable agent task linked to brain knowledge.",
      inputSchema: createTaskSchema.shape,
      annotations: write,
    },
    (input) =>
      scoped(actor, "task:write", () =>
        result(service.createTask(createTaskSchema.parse(input), actor)),
      ),
  );

  const claimConfig = {
    title: "Claim a task",
    description: "Atomically claims a specific or next available task with a renewable lease.",
    inputSchema: claimTaskSchema.shape,
    annotations: write,
  };
  server.registerTool("claim_task", claimConfig, (input) => {
    requireAccessScope(actor, "task:write");
    const parsed = claimTaskSchema.parse(input);
    return result(service.claimTask(parsed.brainId, parsed.taskId, parsed.leaseSeconds, actor));
  });
  server.registerTool("claim_next_task", claimConfig, (input) => {
    requireAccessScope(actor, "task:write");
    const parsed = claimTaskSchema.parse({ ...input, taskId: undefined });
    return result(service.claimTask(parsed.brainId, undefined, parsed.leaseSeconds, actor));
  });

  server.registerTool(
    "heartbeat_claim",
    {
      title: "Renew a task lease",
      description: "Keeps the current actor's task claim alive.",
      inputSchema: {
        taskId: z.uuid(),
        leaseSeconds: z.number().int().min(60).max(3600).default(600),
      },
      annotations: { ...write, idempotentHint: true },
    },
    ({ taskId, leaseSeconds }) =>
      scoped(actor, "task:write", () => result(service.heartbeatTask(taskId, leaseSeconds, actor))),
  );

  server.registerTool(
    "release_claim",
    {
      title: "Release a task lease",
      description: "Releases the current actor's claim without cancelling the task.",
      inputSchema: { taskId: z.uuid() },
      annotations: write,
    },
    ({ taskId }) =>
      scoped(actor, "task:write", () => result(service.releaseTask(taskId, false, actor))),
  );
  server.registerTool(
    "force_release_claim",
    {
      title: "Force release a task lease",
      description: "Brain-owner action that releases another actor's stale or incorrect claim.",
      inputSchema: { taskId: z.uuid() },
      annotations: { ...write, destructiveHint: true },
    },
    ({ taskId }) =>
      scoped(actor, "task:write", () => result(service.releaseTask(taskId, true, actor))),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update a task",
      description: "Updates status, title, brief, or priority without changing its audit history.",
      inputSchema: {
        taskId: z.uuid(),
        status: taskStatusSchema.optional(),
        title: z.string().min(1).max(240).optional(),
        brief: z.string().min(1).max(20_000).optional(),
        priority: z.number().int().min(-100).max(100).optional(),
      },
      annotations: write,
    },
    ({ taskId, ...patch }) =>
      scoped(actor, "task:write", () =>
        result(service.updateTask(taskId, defined(patch) as any, actor)),
      ),
  );

  server.registerTool(
    "approve_task",
    {
      title: "Approve a task",
      description: "Moves a task to approved review state.",
      inputSchema: { taskId: z.uuid() },
      annotations: write,
    },
    ({ taskId }) =>
      scoped(actor, "task:write", () =>
        result(service.updateTask(taskId, { status: "approved" }, actor)),
      ),
  );
  server.registerTool(
    "cancel_task",
    {
      title: "Cancel a task",
      description: "Cancels a task without deleting its history.",
      inputSchema: { taskId: z.uuid() },
      annotations: { ...write, destructiveHint: true },
    },
    ({ taskId }) =>
      scoped(actor, "task:write", () =>
        result(service.updateTask(taskId, { status: "cancelled" }, actor)),
      ),
  );

  server.registerTool(
    "comment_task",
    {
      title: "Comment on a task",
      description: "Adds an attributed task comment.",
      inputSchema: { taskId: z.uuid(), body: z.string().min(1).max(20_000) },
      annotations: write,
    },
    ({ taskId, body }) =>
      scoped(actor, "task:write", () => result(service.commentTask(taskId, body, actor))),
  );
  server.registerTool(
    "attach_task_link",
    {
      title: "Attach a link to a task",
      description: "Adds or updates an attributed external link on a task.",
      inputSchema: {
        taskId: z.uuid(),
        url: externalUrlSchema,
        label: z.string().max(240).nullable().default(null),
      },
      annotations: write,
    },
    ({ taskId, url, label }) =>
      scoped(actor, "task:write", () => result(service.attachTaskLink(taskId, url, label, actor))),
  );
  server.registerTool(
    "link_task_article",
    {
      title: "Link a task to an article",
      description: "Connects a task to an article in the same brain.",
      inputSchema: { taskId: z.uuid(), articleId: z.uuid() },
      annotations: write,
    },
    ({ taskId, articleId }) =>
      scoped(actor, "task:write", () => result(service.linkTaskArticle(taskId, articleId, actor))),
  );

  server.registerTool(
    "scan_brain",
    {
      title: "Scan brain maintenance",
      description:
        "Runs deterministic stale, oversized, duplicate, conflict, and broken-link checks. It never edits canon.",
      inputSchema: { brainId: z.uuid() },
      annotations: { ...write, idempotentHint: true },
    },
    ({ brainId }) =>
      scoped(actor, "brain:write", () => result(service.scanMaintenance(brainId, actor))),
  );
  server.registerTool(
    "list_maintenance_candidates",
    {
      title: "List maintenance candidates",
      description: "Lists reviewable maintenance findings for an agent-driven curation session.",
      inputSchema: { brainId: z.uuid() },
      annotations: read,
    },
    ({ brainId }) =>
      scoped(actor, "brain:read", () => result(service.listMaintenance(brainId, actor))),
  );

  server.registerTool(
    "propose_invite",
    {
      title: "Propose a brain invitation",
      description:
        "Owner-only. Creates a seven-day invitation token for a teammate; the user must choose how to deliver it.",
      inputSchema: {
        brainId: z.uuid(),
        email: z.email(),
        role: z.enum(["editor", "commenter", "viewer"]),
      },
      annotations: write,
    },
    ({ brainId, email, role }) =>
      scoped(actor, "brain:write", () =>
        result(service.proposeInvite(brainId, email, role, actor)),
      ),
  );

  return server;
}

async function result(value: unknown) {
  return publicResult(await value);
}

function publicResult(value: unknown) {
  const clean = sanitize(value);
  const structured =
    clean && typeof clean === "object" && !Array.isArray(clean) ? clean : { items: clean };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(clean, null, 2) }],
    structuredContent: structured as Record<string, unknown>,
  };
}

export function sanitize(value: any): any {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (["body", "bodyAad", "wrappedKey", "passwordHash"].includes(key)) continue;
    output[key] = sanitize(child);
  }
  return output;
}

function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined),
  ) as Partial<T>;
}

function scoped<T>(actor: ScopedActor, scope: AccessScope, operation: () => T): T {
  requireAccessScope(actor, scope);
  return operation();
}
