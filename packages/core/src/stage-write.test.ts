import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decrypt, generateDataKey, hashContent, unwrapDataKey, wrapDataKey } from "./crypto.js";
import { RementumService } from "./service.js";
import type {
  Actor,
  ArticleGenerator,
  ArticleRecord,
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
    getArticle: vi.fn(async () => ({ id: articleId, brainId }) as ArticleRecord),
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

describe("deferred article compaction", () => {
  it("stages the submitted title and body without calling the LLM", async () => {
    const { articleGenerator, brainRecord, service, store } = setup();
    await expect(service.stageWrite(createInput(), actor)).resolves.toMatchObject({
      title: "Architecture",
      summary: "Canonical body",
    });
    expect(articleGenerator.generateArticle).not.toHaveBeenCalled();
    expect(store.findPotentialConflicts).toHaveBeenCalledWith(
      brainId,
      undefined,
      "Architecture",
      "Canonical body",
      actor,
    );
    expect(store.createStagedWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Architecture",
        summary: "Canonical body",
        body: "Canonical body",
      }),
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
    expect(decrypt(call[4], key, call[5]).toString("utf8")).toBe("Canonical body");
    expect(call[6]).toBe(hashContent("Canonical body"));
  });

  it("stages the complete resulting body for appends without calling the LLM", async () => {
    const { articleGenerator, brainRecord, service, store } = setup();
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
    expect(articleGenerator.generateArticle).not.toHaveBeenCalled();
    const call = vi.mocked(store.createStagedWrite).mock.calls[0];
    if (!call) throw new Error("Missing staged-write call");
    const key = unwrapDataKey(brainRecord.wrappedKey, masterKey, brainRecord.id);
    expect(decrypt(call[4], key, call[5]).toString("utf8")).toBe("Current body\n\nNew entry");
  });

  it("refuses to stage against an article in another brain", async () => {
    const { service, store } = setup();
    vi.mocked(store.getArticle).mockResolvedValue({
      id: articleId,
      brainId: "00000000-0000-4000-8000-00000000000f",
    } as ArticleRecord);
    await expect(
      service.stageWrite(
        { ...createInput(), operation: "update", articleId, baseVersion: 1 },
        actor,
      ),
    ).rejects.toThrow(/Article/);
    expect(store.createStagedWrite).not.toHaveBeenCalled();
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

  it("does not depend on provider availability while staging", async () => {
    const { articleGenerator, service, store } = setup();
    vi.mocked(articleGenerator.generateArticle).mockRejectedValue(
      new Error("provider unavailable"),
    );
    await expect(service.stageWrite(createInput(), actor)).resolves.toMatchObject({
      title: "Architecture",
      summary: "Canonical body",
    });
    expect(store.createStagedWrite).toHaveBeenCalledOnce();
  });
});
