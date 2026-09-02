import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  contentAad,
  decrypt,
  encrypt,
  generateDataKey,
  hashContent,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto.js";
import { RementumService } from "./service.js";
import type {
  Actor,
  ArticleGenerator,
  BrainRecord,
  ClaimedCompactionJob,
  CompactionJobRecord,
  DataStore,
  EmbeddingClient,
  VersionRecord,
  WorkspaceRecord,
} from "./types.js";

const masterKey = randomBytes(32);
const brainId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const articleId = "00000000-0000-4000-8000-000000000003";
const actor: Actor = {
  userId: "00000000-0000-4000-8000-000000000004",
  clientId: "rementum-worker",
  systemOwner: false,
  teamRoles: new Map(),
  workspaceRoles: new Map([[workspaceId, "owner"]]),
  brainRoles: new Map([[brainId, "owner"]]),
};

function setup(attempts = 1) {
  const dataKey = generateDataKey();
  const brain: BrainRecord = {
    id: brainId,
    workspaceId,
    slug: "brain",
    name: "Brain",
    description: "",
    instructions: "",
    wrappedKey: wrapDataKey(dataKey, masterKey, brainId),
    createdBy: actor.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const workspace: WorkspaceRecord = {
    id: workspaceId,
    teamId: "00000000-0000-4000-8000-000000000005",
    slug: "workspace",
    name: "Workspace",
    llmCompactionEnabled: true,
    role: "owner",
    createdAt: new Date(),
  };
  const aad = `brain:${brainId}:article:${articleId}:version:1`;
  const version: VersionRecord = {
    id: "00000000-0000-4000-8000-000000000006",
    brainId,
    articleId,
    version: 1,
    body: encrypt("Original canonical body", dataKey, aad),
    bodyAad: aad,
    bodyHash: hashContent("Original canonical body"),
    changeSummary: "Create article",
    sources: [],
    actorId: actor.userId,
    clientId: "test",
    createdAt: new Date(),
  };
  const job: CompactionJobRecord = {
    id: "00000000-0000-4000-8000-000000000007",
    workspaceId,
    brainId,
    articleId,
    articleVersion: 1,
    sourceTitle: "Original title",
    status: "processing",
    attempts,
    availableAt: new Date(),
    claimedBy: "worker-claim",
    leaseExpiresAt: new Date(Date.now() + 60_000),
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const claim: ClaimedCompactionJob = {
    jobId: job.id,
    workspaceId,
    brainId,
    articleId,
    articleVersion: 1,
    sourceTitle: job.sourceTitle,
    attempts,
    ownerId: actor.userId,
    claimId: "worker-claim",
  };
  const store = {
    getCompactionJob: vi.fn(async () => job),
    getWorkspace: vi.fn(async () => workspace),
    getBrain: vi.fn(async () => brain),
    getVersion: vi.fn(async () => version),
    completeCompaction: vi.fn(async () => ({ current: false, articleId, version: 1 })),
    failCompaction: vi.fn(async (_jobId, _claimId, _error, retryAt) => ({
      current: false,
      terminal: retryAt === null,
      articleId,
      version: 1,
    })),
    audit: vi.fn(async () => undefined),
    clearEmbeddings: vi.fn(async () => undefined),
  } as unknown as DataStore;
  const generated = {
    title: "Compact title",
    summary: "One compact sentence.",
    body: "# Compact title\n\nCompact body.",
  };
  const generator = {
    generateArticle: vi.fn(async () => generated),
  } satisfies ArticleGenerator;
  const service = new RementumService(store, {} as EmbeddingClient, masterKey, generator, true);
  return { brain, claim, generated, generator, job, service, store, version };
}

describe("deferred article compaction", () => {
  it("seals the generated content as the next version rather than over the source", async () => {
    const { brain, claim, generated, generator, service, store } = setup();

    await expect(service.compactClaimedJob(claim, actor)).resolves.toMatchObject({
      articleId,
      version: 1,
    });
    expect(generator.generateArticle).toHaveBeenCalledWith({
      title: "Original title",
      body: "Original canonical body",
    });
    const complete = vi.mocked(store.completeCompaction).mock.calls[0];
    if (!complete) throw new Error("Missing compaction completion call");
    const key = unwrapDataKey(brain.wrappedKey, masterKey, brain.id);
    const sealed = complete[3](2);
    expect(sealed.bodyAad).toBe(contentAad(brainId, articleId, 2));
    expect(decrypt(sealed.body, key, sealed.bodyAad).toString("utf8")).toBe(generated.body);
    expect(complete[4]).toBe(hashContent(generated.body));
  });

  it("schedules one-minute and five-minute retries before terminal failure", async () => {
    const first = setup(1);
    const beforeFirst = Date.now();
    await first.service.failClaimedCompaction(first.claim, new Error("provider down"), actor);
    const firstRetry = vi.mocked(first.store.failCompaction).mock.calls[0]?.[3];
    expect(firstRetry?.getTime()).toBeGreaterThanOrEqual(beforeFirst + 60_000);

    const second = setup(2);
    const beforeSecond = Date.now();
    await second.service.failClaimedCompaction(second.claim, new Error("provider down"), actor);
    const secondRetry = vi.mocked(second.store.failCompaction).mock.calls[0]?.[3];
    expect(secondRetry?.getTime()).toBeGreaterThanOrEqual(beforeSecond + 5 * 60_000);

    const third = setup(3);
    await third.service.failClaimedCompaction(third.claim, new Error("provider down"), actor);
    expect(vi.mocked(third.store.failCompaction).mock.calls[0]?.[3]).toBeNull();
  });
});
