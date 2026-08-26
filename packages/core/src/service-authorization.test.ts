import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedKey } from "./crypto.js";
import { encrypt, generateDataKey, unwrapDataKey, wrapDataKey } from "./crypto.js";
import { ConflictError, ForbiddenError, LlmUnavailableError, NotFoundError } from "./errors.js";
import { RementumService } from "./service.js";
import type {
  Actor,
  ArticleRecord,
  BrainRecord,
  DataStore,
  EmbeddingClient,
  StagedWriteRecord,
} from "./types.js";

const masterKey = randomBytes(32);
const brainId = "00000000-0000-4000-8000-000000000001";
const otherBrainId = "00000000-0000-4000-8000-000000000002";
const articleId = "00000000-0000-4000-8000-000000000003";
const workspaceId = "00000000-0000-4000-8000-000000000004";
const teamId = "00000000-0000-4000-8000-000000000005";
const userId = "00000000-0000-4000-8000-000000000006";
const otherUserId = "00000000-0000-4000-8000-000000000007";

type BrainRole = "owner" | "editor" | "commenter" | "viewer";

function actor(role: BrainRole | null, overrides: Partial<Actor> = {}): Actor {
  return {
    userId,
    clientId: "test",
    teamRoles: new Map([[teamId, "owner"]]),
    workspaceRoles: new Map([[workspaceId, "owner"]]),
    brainRoles: role ? new Map([[brainId, role]]) : new Map(),
    ...overrides,
  };
}

function brainRecord(): BrainRecord {
  const now = new Date();
  return {
    id: brainId,
    workspaceId,
    slug: "product",
    name: "Product knowledge",
    description: "",
    instructions: "",
    wrappedKey: wrapDataKey(generateDataKey(), masterKey, brainId),
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };
}

function articleRecord(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: articleId,
    brainId,
    slug: "architecture",
    title: "Architecture",
    summary: "How the system fits together.",
    keywords: ["architecture"],
    kind: "canonical",
    freshness: "current",
    currentVersion: 2,
    compactionStatus: "not_requested",
    compactionAttempts: 0,
    compactionError: null,
    compactedAt: null,
    verifiedAt: null,
    reviewAfter: null,
    updatedAt: new Date(),
    ...overrides,
  } as ArticleRecord;
}

function setup(options: { llmAvailable?: boolean } = {}) {
  const brain = brainRecord();
  const key = unwrapDataKey(brain.wrappedKey, masterKey, brainId);
  const store = {
    audit: vi.fn(async () => undefined),
    createBrain: vi.fn(async (_input, _actor, wrappedKey: WrappedKey, id: string) => ({
      ...brainRecord(),
      id,
      wrappedKey,
    })),
    getBrain: vi.fn(async () => brain),
    getArticle: vi.fn(async () => articleRecord()),
    getCurrentVersion: vi.fn(async () => ({
      version: 2,
      body: encrypt(
        "# Architecture\n\nThe canonical body.",
        key,
        `brain:${brainId}:article:${articleId}:version:2`,
      ),
      bodyAad: `brain:${brainId}:article:${articleId}:version:2`,
      actorId: userId,
      clientId: "test",
      changeSummary: "Rewrite",
      createdAt: new Date(),
    })),
    getArticleLinks: vi.fn(async () => []),
    getArticleSources: vi.fn(async () => []),
    isBrainCompactionEnabled: vi.fn(async () => false),
    listRoutingIndex: vi.fn(async () => []),
    listStagedWrites: vi.fn(async () => []),
    listTasks: vi.fn(async () => []),
    listMaintenance: vi.fn(async () => []),
    recentActivity: vi.fn(async () => []),
    scanMaintenance: vi.fn(async () => []),
    search: vi.fn(async () => []),
    createTask: vi.fn(async () => ({ id: "task-id", brainId })),
    queueArticleCompaction: vi.fn(async () => undefined),
    claimTask: vi.fn(async () => null),
    getStagedWrite: vi.fn(async () => stagedWrite()),
    withdrawStagedWrite: vi.fn(async () => stagedWrite({ status: "withdrawn" })),
    promoteStagedWrite: vi.fn(async () => ({
      article: articleRecord(),
      version: { version: 3 },
    })),
    updateWorkspace: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
      id: workspaceId,
      teamId,
      name: "Workspace",
      slug: "workspace",
      llmCompactionEnabled: patch.llmCompactionEnabled ?? false,
      createdAt: new Date(),
    })),
    cancelWorkspaceCompactions: vi.fn(async () => []),
    deleteWorkspace: vi.fn(async () => ({ id: workspaceId, teamId, name: "Workspace" })),
    getStagedWriteByIdempotencyKey: vi.fn(async () => null),
    findPotentialConflicts: vi.fn(async () => []),
    createStagedWrite: vi.fn(async () => stagedWrite()),
  } as unknown as DataStore;
  const embeddings = {
    embedQuery: vi.fn(async () => [0.1, 0.2]),
    embedDocument: vi.fn(async () => [0.1, 0.2]),
    healthy: vi.fn(async () => true),
  } as unknown as EmbeddingClient;
  const service = new RementumService(store, embeddings, masterKey, null, options.llmAvailable);
  return { brain, embeddings, key, service, store };

  function stagedWrite(overrides: Partial<StagedWriteRecord> = {}): StagedWriteRecord {
    const bodyAad = `brain:${brainId}:article:${articleId}:write:write-id`;
    return {
      id: "write-id",
      brainId,
      articleId,
      operation: "update",
      status: "pending",
      stagedBy: otherUserId,
      body: encrypt("The candidate body.", key, bodyAad),
      bodyAad,
      ...overrides,
    } as StagedWriteRecord;
  }
}

describe("brain role boundaries", () => {
  let service: RementumService;

  beforeEach(() => {
    service = setup().service;
  });

  const readers: Array<[string, (service: RementumService, actor: Actor) => Promise<unknown>]> = [
    ["getBrain", (s, a) => s.getBrain(brainId, a)],
    ["listStagedWrites", (s, a) => s.listStagedWrites(brainId, undefined, a)],
    ["listTasks", (s, a) => s.listTasks(brainId, a)],
    ["recentActivity", (s, a) => s.recentActivity(brainId, 50, a)],
    ["search", (s, a) => s.search({ brainId, query: "anything", limit: 10 } as never, a)],
  ];

  it.each(readers)("refuses %s for an actor with no role on the brain", async (_name, call) => {
    await expect(call(service, actor(null))).rejects.toThrow(ForbiddenError);
  });

  const writers: Array<[string, (service: RementumService, actor: Actor) => Promise<unknown>]> = [
    ["createTask", (s, a) => s.createTask({ brainId, title: "T", brief: "B" } as never, a)],
    ["claimTask", (s, a) => s.claimTask(brainId, undefined, 600, a)],
    ["scanMaintenance", (s, a) => s.scanMaintenance(brainId, a)],
    ["listMaintenance", (s, a) => s.listMaintenance(brainId, a)],
  ];

  it.each(writers)("refuses %s for a viewer", async (_name, call) => {
    await expect(call(service, actor("viewer"))).rejects.toThrow(ForbiddenError);
    await expect(call(service, actor("editor"))).resolves.toBeDefined();
  });
});

describe("workspace and team role boundaries", () => {
  it("only lets a workspace owner delete it", async () => {
    const { service, store } = setup();
    const admin = actor("owner", { workspaceRoles: new Map([[workspaceId, "admin"]]) });
    await expect(service.deleteWorkspace(workspaceId, "Workspace", admin)).rejects.toThrow(
      ForbiddenError,
    );
    expect(store.deleteWorkspace).not.toHaveBeenCalled();
    await expect(
      service.deleteWorkspace(workspaceId, "Workspace", actor("owner")),
    ).resolves.toBeUndefined();
  });

  it("only lets a team owner or admin create a workspace", async () => {
    const { service } = setup();
    const member = actor("owner", { teamRoles: new Map([[teamId, "member"]]) });
    await expect(
      service.createWorkspace(teamId, { name: "Second" } as never, member),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("brain keys", () => {
  it("wraps a fresh data key against the new brain id and never returns it", async () => {
    const { service, store } = setup();
    const created = await service.createBrain(
      { name: "New brain", workspaceId } as never,
      actor(null),
    );
    expect(created.brain).not.toHaveProperty("wrappedKey");
    const [, , wrappedKey, id] = vi.mocked(store.createBrain).mock.calls[0] as [
      unknown,
      unknown,
      WrappedKey,
      string,
    ];
    expect(() => unwrapDataKey(wrappedKey, masterKey, id)).not.toThrow();
    // The wrapping is bound to the brain it was created for.
    expect(() => unwrapDataKey(wrappedKey, masterKey, otherBrainId)).toThrow();
  });

  it("decrypts an article body with the key of the brain that owns it", async () => {
    const { service } = setup();
    const article = await service.readArticle(articleId, actor("viewer"));
    expect(article.body).toBe("# Architecture\n\nThe canonical body.");
    expect(article.currentVersion).toBe(2);
    expect(article.provenance.changeSummary).toBe("Rewrite");
  });

  it("refuses to read an article in a brain the actor has no role on", async () => {
    const { service, store } = setup();
    vi.mocked(store.getArticle).mockResolvedValueOnce(articleRecord({ brainId: otherBrainId }));
    await expect(service.readArticle(articleId, actor("owner"))).rejects.toThrow(ForbiddenError);
  });

  it("reports a missing article rather than the brain it would have been in", async () => {
    const { service, store } = setup();
    vi.mocked(store.getArticle).mockResolvedValueOnce(null);
    await expect(service.readArticle(articleId, actor("owner"))).rejects.toThrow(NotFoundError);
  });
});

describe("search", () => {
  it("passes the query embedding to the store when the service answers", async () => {
    const { service, store } = setup();
    await service.search({ brainId, query: "encryption", limit: 10 } as never, actor("viewer"));
    expect(store.search).toHaveBeenCalledWith(expect.anything(), expect.anything(), [0.1, 0.2]);
    expect(store.audit).toHaveBeenCalledWith(
      expect.anything(),
      "article.search",
      `brain:${brainId}`,
      expect.objectContaining({ semantic: true }),
    );
  });

  it("degrades to metadata search when the embedding service is unavailable", async () => {
    const { embeddings, service, store } = setup();
    vi.mocked(embeddings.embedQuery).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(
      service.search({ brainId, query: "encryption", limit: 10 } as never, actor("viewer")),
    ).resolves.toEqual([]);
    expect(store.search).toHaveBeenCalledWith(expect.anything(), expect.anything(), null);
  });

  it("audits a hash of the query rather than the query itself", async () => {
    const { service, store } = setup();
    await service.search(
      { brainId, query: "an internal code name", limit: 10 } as never,
      actor("viewer"),
    );
    const detail = vi.mocked(store.audit).mock.calls[0]?.[3] as Record<string, unknown>;
    expect(detail.queryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(detail)).not.toContain("an internal code name");
  });
});

describe("staged write promotion", () => {
  it("refuses to let the staging actor approve their own override", async () => {
    const { service, store } = setup();
    vi.mocked(store.getStagedWrite).mockResolvedValueOnce({
      id: "write-id",
      brainId,
      stagedBy: userId,
    } as StagedWriteRecord);
    await expect(
      service.promoteWrite({ writeId: "write-id", decision: "override" } as never, actor("owner")),
    ).rejects.toThrow(ForbiddenError);
    expect(store.promoteStagedWrite).not.toHaveBeenCalled();
  });

  it("lets a different owner approve an override", async () => {
    const { service, store } = setup();
    await expect(
      service.promoteWrite({ writeId: "write-id", decision: "override" } as never, actor("owner")),
    ).resolves.toMatchObject({ version: { version: 3 } });
    expect(store.promoteStagedWrite).toHaveBeenCalled();
  });

  it("only lets the staging actor or a brain owner withdraw a write", async () => {
    const { service } = setup();
    await expect(service.withdrawWrite("write-id", actor("editor"))).rejects.toThrow(
      ForbiddenError,
    );
    // The write was staged by otherUserId, so that editor may take it back even though
    // the editor above may not.
    await expect(
      service.withdrawWrite("write-id", actor("editor", { userId: otherUserId })),
    ).resolves.toMatchObject({ status: "withdrawn" });
    await expect(service.withdrawWrite("write-id", actor("owner"))).resolves.toMatchObject({
      status: "withdrawn",
    });
  });

  it("shows a reviewer the decrypted candidate beside the current body", async () => {
    const { service } = setup();
    const review = await service.reviewStagedWrite("write-id", actor("editor"));
    expect(review.candidateBody).toBe("The candidate body.");
    expect(review.currentBody).toBe("# Architecture\n\nThe canonical body.");
  });

  it("has no current body to show for a create", async () => {
    const { service, store } = setup();
    vi.mocked(store.getStagedWrite).mockResolvedValue({
      ...(await store.getStagedWrite("write-id", actor("editor"))),
      operation: "create",
    } as StagedWriteRecord);
    const review = await service.reviewStagedWrite("write-id", actor("editor"));
    expect(review.currentBody).toBeNull();
    expect(review.candidateBody).toBe("The candidate body.");
  });
});

describe("workspace compaction settings", () => {
  it("refuses to enable compaction on an instance with no provider configured", async () => {
    const { service, store } = setup({ llmAvailable: false });
    await expect(
      service.updateWorkspace(workspaceId, { llmCompactionEnabled: true }, actor("owner")),
    ).rejects.toThrow(LlmUnavailableError);
    expect(store.updateWorkspace).not.toHaveBeenCalled();
  });

  it("enables compaction when a provider is configured", async () => {
    const { service } = setup({ llmAvailable: true });
    await expect(
      service.updateWorkspace(workspaceId, { llmCompactionEnabled: true }, actor("owner")),
    ).resolves.toMatchObject({ llmCompactionEnabled: true });
  });

  it("cancels queued compactions when the setting is turned off", async () => {
    const { service, store } = setup({ llmAvailable: true });
    await service.updateWorkspace(workspaceId, { llmCompactionEnabled: false }, actor("owner"));
    expect(store.cancelWorkspaceCompactions).toHaveBeenCalledWith(workspaceId, expect.anything());
  });

  it("refuses to queue a workspace-wide compaction without a provider", async () => {
    const { service } = setup({ llmAvailable: false });
    await expect(service.queueWorkspaceCompactions(workspaceId, actor("owner"))).rejects.toThrow(
      LlmUnavailableError,
    );
  });
});

describe("article compaction requests", () => {
  it("refuses when the instance has no provider", async () => {
    const { service } = setup({ llmAvailable: false });
    await expect(service.queueArticleCompaction(articleId, actor("owner"))).rejects.toThrow(
      LlmUnavailableError,
    );
  });

  it("refuses when the workspace has compaction switched off", async () => {
    const { service } = setup({ llmAvailable: true });
    await expect(service.queueArticleCompaction(articleId, actor("owner"))).rejects.toThrow(
      ConflictError,
    );
  });

  it("returns the queued status without queueing twice", async () => {
    const { service, store } = setup({ llmAvailable: true });
    vi.mocked(store.getArticle).mockResolvedValueOnce(
      articleRecord({ compactionStatus: "queued" }),
    );
    await expect(service.queueArticleCompaction(articleId, actor("owner"))).resolves.toEqual({
      articleId,
      version: 2,
      status: "queued",
    });
    expect(store.queueArticleCompaction).not.toHaveBeenCalled();
  });
});
