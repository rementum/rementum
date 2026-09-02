import { randomBytes } from "node:crypto";
import { ConflictError, contentAad, hashContent, RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore, setActorConfig } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

const embeddings = {
  embedQuery: async () => ({ model: "test-model", vector: [] }),
  embedPassages: async () => ({ model: "test-model", vectors: [] }),
  healthy: async () => true,
};

async function seed(store: PostgresStore, auth: AuthRepository, service: RementumService) {
  const suffix = randomBytes(6).toString("hex");
  const owner = await auth.registerAccount(
    `promo-owner-${suffix}@example.test`,
    "Owner",
    "owner-password-hash",
    "Promotion team",
    `promo-${suffix}`,
  );
  if (!owner) throw new Error("Owner registration failed");
  const ownerActor = await store.loadActor(owner.user.id, "integration-test");
  const brain = await service.createBrain(
    {
      workspaceId: owner.workspaceId,
      slug: `promo-${suffix}`,
      name: "Promotion brain",
      description: "",
      instructions: "",
    },
    ownerActor,
  );
  return { suffix, owner, ownerActor, brainId: brain.brain.id };
}

function createInput(brainId: string, slug: string, body = "A durable body.") {
  return {
    brainId,
    operation: "create" as const,
    slug,
    title: `Title ${slug}`,
    keywords: [],
    kind: "canonical" as const,
    body,
    changeSummary: `create ${slug}`,
    sources: [],
    acknowledgePotentialConflicts: true,
  };
}

integration("promotion protocol", () => {
  it("binds promoted bodies to their version, records writes in activity, and refuses a taken slug", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId } = await seed(store, auth, service);
      const write = await service.stageWrite(createInput(brainId, "bound"), ownerActor);
      const promoted = await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "ok" },
        ownerActor,
      );
      const version = await store.getVersion(promoted.article.id, 1, ownerActor);
      expect(version?.bodyAad).toBe(contentAad(brainId, promoted.article.id, 1));
      expect(version?.bodyAad).not.toBe(write.bodyAad);
      const read = await service.readArticle(promoted.article.id, ownerActor);
      expect(read.body).toBe("A durable body.");

      const actions = (await service.recentActivity(brainId, 50, ownerActor)).map(
        (event) => event.action,
      );
      expect(actions).toContain("write.staged");
      expect(actions).toContain("write.promoted");

      const duplicate = await service.stageWrite(createInput(brainId, "bound"), ownerActor);
      await expect(
        service.promoteWrite(
          { writeId: duplicate.id, decision: "promote", decisionSummary: "dup" },
          ownerActor,
        ),
      ).rejects.toMatchObject({ detail: { articleId: promoted.article.id, currentVersion: 1 } });
      // The write is still pending, so it can be withdrawn or re-staged as an update.
      expect((await service.getWriteStatus(duplicate.id, ownerActor)).status).toBe("pending");
    } finally {
      await database.close();
    }
  });

  it("lists writes awaiting review across the workspace with per-brain counts", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId, owner, suffix } = await seed(store, auth, service);
      const other = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `queue-${suffix}`,
          name: "Queue brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      await service.stageWrite(createInput(brainId, "first"), ownerActor);
      await service.stageWrite(createInput(brainId, "second"), ownerActor);
      const promotedLater = await service.stageWrite(createInput(brainId, "third"), ownerActor);
      await service.promoteWrite(
        { writeId: promotedLater.id, decision: "promote", decisionSummary: "ok" },
        ownerActor,
      );
      await service.stageWrite(createInput(other.brain.id, "elsewhere"), ownerActor);

      const queue = await service.listWorkspaceReviewQueue(owner.workspaceId, ownerActor);
      expect(queue.items.map((item) => item.slug).sort()).toEqual(["elsewhere", "first", "second"]);
      expect(queue.items.find((item) => item.slug === "elsewhere")?.brainName).toBe("Queue brain");
      expect(queue.counts.sort((a, b) => a.brainId.localeCompare(b.brainId))).toEqual(
        [
          { brainId, pending: 2, conflicted: 0 },
          { brainId: other.brain.id, pending: 1, conflicted: 0 },
        ].sort((a, b) => a.brainId.localeCompare(b.brainId)),
      );
      expect(
        (await service.listWorkspaceReviewQueue(owner.workspaceId, ownerActor, 1)).items,
      ).toHaveLength(1);
    } finally {
      await database.close();
    }
  });

  it("keeps idempotency keys race safe and inside their brain", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 4);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId, owner, suffix } = await seed(store, auth, service);
      const key = `key-${suffix}`;
      const [first, second] = await Promise.all([
        service.stageWrite({ ...createInput(brainId, "same"), idempotencyKey: key }, ownerActor),
        service.stageWrite({ ...createInput(brainId, "same"), idempotencyKey: key }, ownerActor),
      ]);
      expect(first.id).toBe(second.id);

      const other = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `other-${suffix}`,
          name: "Other brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      await expect(
        service.stageWrite(
          { ...createInput(other.brain.id, "same"), idempotencyKey: key },
          ownerActor,
        ),
      ).rejects.toBeInstanceOf(ConflictError);

      const [taskA, taskB] = await Promise.all([
        service.createTask(
          {
            brainId,
            title: "T",
            brief: "B",
            priority: 0,
            articleIds: [],
            links: [],
            idempotencyKey: key,
          },
          ownerActor,
        ),
        service.createTask(
          {
            brainId,
            title: "T",
            brief: "B",
            priority: 0,
            articleIds: [],
            links: [],
            idempotencyKey: key,
          },
          ownerActor,
        ),
      ]);
      expect(taskA.id).toBe(taskB.id);
    } finally {
      await database.close();
    }
  });

  it("refuses task articles from another brain and releases the lease when a task is reopened", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId, owner, suffix } = await seed(store, auth, service);
      const other = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `foreign-${suffix}`,
          name: "Foreign brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const foreignWrite = await service.stageWrite(
        createInput(other.brain.id, "foreign"),
        ownerActor,
      );
      const foreign = await service.promoteWrite(
        { writeId: foreignWrite.id, decision: "promote", decisionSummary: "ok" },
        ownerActor,
      );
      await expect(
        service.createTask(
          {
            brainId,
            title: "T",
            brief: "B",
            priority: 0,
            articleIds: [foreign.article.id],
            links: [],
          },
          ownerActor,
        ),
      ).rejects.toBeInstanceOf(ConflictError);

      const task = await service.createTask(
        { brainId, title: "T", brief: "B", priority: 0, articleIds: [], links: [] },
        ownerActor,
      );
      const claimed = await service.claimTask(brainId, task.id, 600, ownerActor);
      expect(claimed?.status).toBe("claimed");
      const reopened = await service.updateTask(task.id, { status: "open" }, ownerActor);
      expect(reopened.claimedBy).toBeNull();
      expect(reopened.leaseExpiresAt).toBeNull();
      // Another claim can take it straight away instead of waiting for the old lease.
      expect((await service.claimTask(brainId, task.id, 600, ownerActor))?.id).toBe(task.id);
    } finally {
      await database.close();
    }
  });

  it("keeps dismissed maintenance candidates dismissed across scans", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId } = await seed(store, auth, service);
      const write = await service.stageWrite(createInput(brainId, "stale"), ownerActor);
      const promoted = await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "ok" },
        ownerActor,
      );
      await service.verifyArticle(promoted.article.id, new Date(Date.now() - 60_000), ownerActor);
      const first = await service.scanMaintenance(brainId, ownerActor);
      const stale = first.find((candidate) => candidate.kind === "stale");
      if (!stale) throw new Error("Expected a stale candidate");
      await service.updateMaintenance(stale.id, "dismissed", ownerActor);
      await service.scanMaintenance(brainId, ownerActor);
      const after = await store.getMaintenanceCandidate(stale.id, ownerActor);
      expect(after?.status).toBe("dismissed");
    } finally {
      await database.close();
    }
  });
});

integration("agent-proposed invitations", () => {
  it("cannot be accepted until an owner approves, and can be revoked", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId, suffix } = await seed(store, auth, service);
      const agent = { ...ownerActor, clientId: "agent-client" };
      const proposal = await service.requestInvite(
        brainId,
        `guest-${suffix}@example.test`,
        "viewer",
        agent,
      );
      expect(proposal.awaitingApproval).toBe(true);
      expect(proposal).not.toHaveProperty("token");
      const listed = await service.listBrainInvitations(brainId, ownerActor);
      expect(listed).toMatchObject([
        { id: proposal.id, awaitingApproval: true, proposedByClient: "agent-client" },
      ]);

      const approved = await service.approveInvite(proposal.id, ownerActor);
      expect(approved.awaitingApproval).toBe(false);
      expect(await auth.inspectBrainInvitation(hashContent(approved.token))).toMatchObject({
        brainId,
        role: "viewer",
      });
      await expect(service.approveInvite(proposal.id, ownerActor)).rejects.toBeInstanceOf(
        ConflictError,
      );

      await service.revokeInvite(proposal.id, ownerActor);
      expect(await auth.inspectBrainInvitation(hashContent(approved.token))).toBeNull();
      expect(await service.listBrainInvitations(brainId, ownerActor)).toEqual([]);
      await expect(
        auth.acceptBrainInvitation(hashContent(approved.token), null, "Guest", "guest-hash"),
      ).rejects.toThrow();
    } finally {
      await database.close();
    }
  });
});

integration("task approval", () => {
  it("refuses approval by the client that worked on the task and enforces transitions", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId } = await seed(store, auth, service);
      const agent = { ...ownerActor, clientId: "agent-a" };
      const otherAgent = { ...ownerActor, clientId: "agent-b" };
      const human = { ...ownerActor, clientId: "rementum-web" };
      const task = await service.createTask(
        { brainId, title: "T", brief: "B", priority: 0, articleIds: [], links: [] },
        agent,
      );
      // A task cannot be approved before it was reviewed.
      await expect(
        service.updateTask(task.id, { status: "approved" }, human),
      ).rejects.toBeInstanceOf(ConflictError);
      await service.claimTask(brainId, task.id, 600, agent);
      await service.releaseTask(task.id, false, agent);
      await service.updateTask(task.id, { status: "review" }, agent);
      // The agent that held the claim cannot approve its own work, even after release.
      await expect(
        service.updateTask(task.id, { status: "approved" }, agent),
      ).rejects.toMatchObject({ code: "forbidden" });
      // Another client, or the person in the browser, can.
      const approved = await service.updateTask(task.id, { status: "approved" }, otherAgent);
      expect(approved.status).toBe("approved");
      await expect(service.updateTask(task.id, { status: "review" }, human)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect((await service.updateTask(task.id, { status: "completed" }, human)).status).toBe(
        "completed",
      );
      expect((await service.updateTask(task.id, { status: "open" }, human)).status).toBe("open");
    } finally {
      await database.close();
    }
  });
});

integration("row-level security on deletes", () => {
  it("lets a viewer read a brain but not delete from it at the database layer", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7));
    try {
      const { ownerActor, brainId, suffix } = await seed(store, auth, service);
      const write = await service.stageWrite(createInput(brainId, "guarded"), ownerActor);
      const promoted = await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "ok" },
        ownerActor,
      );
      const invitation = await service.proposeInvite(
        brainId,
        `viewer-${suffix}@example.test`,
        "viewer",
        ownerActor,
      );
      const accepted = await auth.acceptBrainInvitation(
        hashContent(invitation.token),
        null,
        "Viewer",
        "viewer-hash",
      );
      const viewer = await store.loadActor(accepted.userId, "integration-test");
      expect(viewer.brainRoles.get(brainId)).toBe("viewer");
      expect((await service.readArticle(promoted.article.id, viewer)).body).toBe("A durable body.");

      const deleted = await database.sql.begin(async (tx) => {
        await setActorConfig(tx, viewer);
        const articles =
          await tx`DELETE FROM articles WHERE id = ${promoted.article.id} RETURNING id`;
        const versions =
          await tx`DELETE FROM article_versions WHERE article_id = ${promoted.article.id} RETURNING id`;
        const members =
          await tx`DELETE FROM brain_members WHERE brain_id = ${brainId} RETURNING user_id`;
        return articles.length + versions.length + members.length;
      });
      expect(deleted).toBe(0);
      expect(await store.getArticle(promoted.article.id, ownerActor)).not.toBeNull();
      expect(
        (await store.loadActor(ownerActor.userId, "integration-test")).brainRoles.get(brainId),
      ).toBe("owner");
    } finally {
      await database.close();
    }
  });
});

integration("worker identity", () => {
  it("keeps a brain owned when its sole owner leaves the team and falls back to the team owner", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(store, embeddings, Buffer.alloc(32, 7), null, true);
    try {
      const { ownerActor, owner, suffix } = await seed(store, auth, service);
      // A plain member creates a brain; they are its only owner row.
      const invitation = await service.proposeTeamInvite(
        owner.teamId,
        `member-${suffix}@example.test`,
        "member",
        ownerActor,
      );
      const accepted = await auth.acceptTeamInvitation(
        hashContent(invitation.token),
        null,
        "Member",
        "member-hash",
      );
      const memberActor = await store.loadActor(accepted.userId, "integration-test");
      const brain = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `member-brain-${suffix}`,
          name: "Member brain",
          description: "",
          instructions: "",
        },
        memberActor,
      );

      // Role maps are loaded per request; this one predates the member's brain.
      const teamOwner = await store.loadActor(owner.user.id, "integration-test");
      await service.removeTeamMember(owner.teamId, accepted.userId, teamOwner);
      const brains = await database.sql<Array<{ brain_id: string; owner_id: string }>>`
        SELECT * FROM owl_worker_brains() WHERE brain_id = ${brain.brain.id}
      `;
      expect(brains[0]?.owner_id).toBe(owner.user.id);

      // Even with no owner row at all, the team owner stands in.
      await database.sql.begin(async (tx) => {
        await setActorConfig(tx, teamOwner);
        await tx`DELETE FROM brain_members WHERE brain_id = ${brain.brain.id}`;
      });
      const fallback = await database.sql<Array<{ brain_id: string; owner_id: string }>>`
        SELECT * FROM owl_worker_brains() WHERE brain_id = ${brain.brain.id}
      `;
      expect(fallback[0]?.owner_id).toBe(owner.user.id);

      // A queued compaction on that brain is claimable, carries its own claim id, and its
      // lease can be extended by the holder only.
      await service.updateWorkspace(owner.workspaceId, { llmCompactionEnabled: true }, teamOwner);
      const write = await service.stageWrite(createInput(brain.brain.id, "compact"), teamOwner);
      await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "ok" },
        teamOwner,
      );
      let claim = null;
      for (let attempt = 0; attempt < 25 && !claim; attempt += 1) {
        const candidate = await store.claimCompaction(`worker-${suffix}`, 120);
        if (!candidate) break;
        if (candidate.brainId === brain.brain.id) claim = candidate;
      }
      if (!claim) throw new Error("Expected to claim the queued compaction");
      expect(claim.ownerId).toBe(owner.user.id);
      expect(claim.claimId.startsWith(`worker-${suffix}:`)).toBe(true);
      expect(await store.extendCompactionLease(claim.jobId, claim.claimId, 300)).toBe(true);
      expect(await store.extendCompactionLease(claim.jobId, `worker-${suffix}`, 300)).toBe(false);
      await service.updateWorkspace(owner.workspaceId, { llmCompactionEnabled: false }, teamOwner);
    } finally {
      await database.close();
    }
  });
});
