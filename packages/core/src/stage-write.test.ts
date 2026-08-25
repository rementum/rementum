import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { generateDataKey, wrapDataKey } from "./crypto.js";
import { RementumService } from "./service.js";
import type {
  Actor,
  BrainRecord,
  DataStore,
  EmbeddingClient,
  ReadArticleResult,
  StagedWriteRecord,
  SummaryGenerator,
} from "./types.js";

const brainId = "00000000-0000-4000-8000-000000000001";
const articleId = "00000000-0000-4000-8000-000000000002";
const masterKey = randomBytes(32);
const actor: Actor = {
  userId: "00000000-0000-4000-8000-000000000003",
  clientId: "test",
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

function write(summary: string): StagedWriteRecord {
  return { id: "write-id", summary } as StagedWriteRecord;
}

function setup(summary = "Generated summary") {
  const store = {
    getBrain: vi.fn(async () => brain()),
    getStagedWriteByIdempotencyKey: vi.fn(async () => null),
    findPotentialConflicts: vi.fn(async () => []),
    createStagedWrite: vi.fn(async (input) => write(input.summary)),
    audit: vi.fn(async () => undefined),
  } as unknown as DataStore;
  const summaries = {
    generateSummary: vi.fn(async () => summary),
  } satisfies SummaryGenerator;
  const embeddings = {} as EmbeddingClient;
  const service = new RementumService(store, embeddings, masterKey, summaries);
  return { service, store, summaries };
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

describe("AI-generated staged-write summaries", () => {
  it("uses the generated summary for conflicts and persistence", async () => {
    const { service, store, summaries } = setup();
    await expect(service.stageWrite(createInput(), actor)).resolves.toMatchObject({
      summary: "Generated summary",
    });
    expect(summaries.generateSummary).toHaveBeenCalledWith({
      title: "Architecture",
      body: "Canonical body",
    });
    expect(store.findPotentialConflicts).toHaveBeenCalledWith(
      brainId,
      undefined,
      "Architecture",
      "Generated summary",
      actor,
    );
    expect(store.createStagedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Generated summary" }),
      actor,
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(String),
      expect.any(String),
      [],
    );
  });

  it("summarizes the complete resulting body for appends", async () => {
    const { service, summaries } = setup();
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
    expect(summaries.generateSummary).toHaveBeenCalledWith({
      title: "Architecture",
      body: "Current body\n\nNew entry",
    });
  });

  it("returns an existing idempotent write without another LLM call", async () => {
    const { service, store, summaries } = setup();
    vi.mocked(store.getStagedWriteByIdempotencyKey).mockResolvedValue(write("Existing summary"));
    await expect(
      service.stageWrite({ ...createInput(), idempotencyKey: "existing-write" }, actor),
    ).resolves.toMatchObject({ summary: "Existing summary" });
    expect(summaries.generateSummary).not.toHaveBeenCalled();
    expect(store.createStagedWrite).not.toHaveBeenCalled();
  });

  it("does not persist when summarization fails", async () => {
    const { service, store, summaries } = setup();
    vi.mocked(summaries.generateSummary).mockRejectedValue(new Error("provider unavailable"));
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
      createStagedWrite: vi.fn(async (input) => write(input.summary)),
      audit: vi.fn(async () => undefined),
    } as unknown as DataStore;
    const service = new RementumService(store, {} as EmbeddingClient, masterKey);

    await expect(service.stageWrite(createInput(), actor)).resolves.toMatchObject({
      summary: "Canonical body",
    });
    expect(store.findPotentialConflicts).toHaveBeenCalledWith(
      brainId,
      undefined,
      "Architecture",
      "Canonical body",
      actor,
    );
  });
});
