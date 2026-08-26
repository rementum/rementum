import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decrypt, generateDataKey, hashContent, unwrapDataKey, wrapDataKey } from "./crypto.js";
import { RementumService } from "./service.js";
import type {
  Actor,
  ArticleGenerator,
  BrainRecord,
  DataStore,
  EmbeddingClient,
  ReadArticleResult,
  StagedWriteRecord,
} from "./types.js";

const brainId = "00000000-0000-4000-8000-000000000001";
const articleId = "00000000-0000-4000-8000-000000000002";
const masterKey = randomBytes(32);
const actor: Actor = {
  userId: "00000000-0000-4000-8000-000000000003",
  clientId: "test",
  teamRoles: new Map(),
  workspaceRoles: new Map(),
  brainRoles: new Map([[brainId, "owner"]]),
};

function brain(): BrainRecord {
  const now = new Date();
  return {
    id: brainId,
    workspaceId: "00000000-0000-4000-8000-000000000004",
    slug: "test",
    name: "Test",
    description: "",
    instructions: "",
    wrappedKey: wrapDataKey(generateDataKey(), masterKey, brainId),
    createdBy: actor.userId,
    createdAt: now,
    updatedAt: now,
  };
}

function write(summary: string, title = "Title"): StagedWriteRecord {
  return { id: "write-id", summary, title } as StagedWriteRecord;
}

function setup(
  generated = {
    title: "Generated title",
    summary: "Generated summary.",
    body: "# Generated\n\nCompact canonical body.",
  },
) {
  const brainRecord = brain();
  const store = {
    getBrain: vi.fn(async () => brainRecord),
    getStagedWriteByIdempotencyKey: vi.fn(async () => null),
    findPotentialConflicts: vi.fn(async () => []),
    createStagedWrite: vi.fn(async (input) => write(input.summary, input.title)),
    audit: vi.fn(async () => undefined),
  } as unknown as DataStore;
  const articleGenerator = {
    generateArticle: vi.fn(async () => generated),
  } satisfies ArticleGenerator;
  const embeddings = {} as EmbeddingClient;
  const service = new RementumService(store, embeddings, masterKey, articleGenerator);
  return { articleGenerator, brainRecord, generated, service, store };
}

function createInput() {
  return {
    brainId,
    operation: "create" as const,
    slug: "architecture",
    title: "Architecture",
    keywords: [],
    kind: "canonical" as const,
    body: "Canonical body",
    changeSummary: "Create architecture memory",
    sources: [],
    acknowledgePotentialConflicts: false,
  };
}

describe("AI-generated staged writes", () => {
  it("stores only the generated title, summary, and body", async () => {
    const { articleGenerator, brainRecord, generated, service, store } = setup();
    await expect(service.stageWrite(createInput(), actor)).resolves.toMatchObject({
      title: generated.title,
      summary: generated.summary,
    });
    expect(articleGenerator.generateArticle).toHaveBeenCalledWith({
      title: "Architecture",
      body: "Canonical body",
    });
    expect(store.findPotentialConflicts).toHaveBeenCalledWith(
      brainId,
      undefined,
      generated.title,
      generated.summary,
      actor,
    );
    expect(store.createStagedWrite).toHaveBeenCalledWith(
      expect.objectContaining(generated),
      actor,
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(String),
      expect.any(String),
      [],
    );
    const call = vi.mocked(store.createStagedWrite).mock.calls[0];
    if (!call) throw new Error("Missing staged-write call");
    const key = unwrapDataKey(brainRecord.wrappedKey, masterKey, brainRecord.id);
    expect(decrypt(call[4], key, call[5]).toString("utf8")).toBe(generated.body);
    expect(call[6]).toBe(hashContent(generated.body));
    expect(decrypt(call[4], key, call[5]).toString("utf8")).not.toContain("Canonical body");
  });

  it("generates from the complete resulting body for appends", async () => {
    const { articleGenerator, service } = setup();
    vi.spyOn(service, "readArticle").mockResolvedValue({
      body: "Current body",
    } as ReadArticleResult);
    await service.stageWrite(
      {
        ...createInput(),
        operation: "append",
        articleId,
        baseVersion: 1,
        kind: "log",
        body: "New entry",
      },
      actor,
    );
    expect(articleGenerator.generateArticle).toHaveBeenCalledWith({
      title: "Architecture",
      body: "Current body\n\nNew entry",
    });
  });

  it("returns an existing idempotent write without another LLM call", async () => {
    const { articleGenerator, service, store } = setup();
    vi.mocked(store.getStagedWriteByIdempotencyKey).mockResolvedValue(write("Existing summary"));
    await expect(
      service.stageWrite({ ...createInput(), idempotencyKey: "existing-write" }, actor),
    ).resolves.toMatchObject({ summary: "Existing summary" });
    expect(articleGenerator.generateArticle).not.toHaveBeenCalled();
    expect(store.createStagedWrite).not.toHaveBeenCalled();
  });

  it("does not persist when summarization fails", async () => {
    const { articleGenerator, service, store } = setup();
    vi.mocked(articleGenerator.generateArticle).mockRejectedValue(
      new Error("provider unavailable"),
    );
    await expect(service.stageWrite(createInput(), actor)).rejects.toMatchObject({
      code: "llm_summary_failed",
      status: 502,
    });
    expect(store.findPotentialConflicts).not.toHaveBeenCalled();
    expect(store.createStagedWrite).not.toHaveBeenCalled();
  });
});

describe("local staged-write summaries", () => {
  it("stages a write when no external summary generator is configured", async () => {
    const store = {
      getBrain: vi.fn(async () => brain()),
      getStagedWriteByIdempotencyKey: vi.fn(async () => null),
      findPotentialConflicts: vi.fn(async () => []),
      createStagedWrite: vi.fn(async (input) => write(input.summary, input.title)),
      audit: vi.fn(async () => undefined),
    } as unknown as DataStore;
    const service = new RementumService(store, {} as EmbeddingClient, masterKey);

    await expect(service.stageWrite(createInput(), actor)).resolves.toMatchObject({
      summary: "Canonical body",
      title: "Architecture",
    });
    expect(store.findPotentialConflicts).toHaveBeenCalledWith(
      brainId,
      undefined,
      "Architecture",
      "Canonical body",
      actor,
    );
    expect(store.createStagedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Canonical body", title: "Architecture" }),
      actor,
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(String),
      hashContent("Canonical body"),
      [],
    );
  });
});
