import { randomBytes } from "node:crypto";
import { hashContent, RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("account and team authorization", () => {
  it("verifies accounts and grants then removes inherited brain access", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const suffix = randomBytes(6).toString("hex");
    const service = new RementumService(
      store,
      {
        embedQuery: async () => ({ model: "test-model", vector: [] }),
        embedPassages: async () => ({ model: "test-model", vectors: [] }),
        healthy: async () => true,
      },
      Buffer.alloc(32, 7),
    );

    try {
      const owner = await auth.registerAccount(
        `owner-${suffix}@example.test`,
        "Owner",
        "owner-password-hash",
        "Primary team",
        `primary-${suffix}`,
      );
      expect(owner?.user.emailVerifiedAt).toBeNull();
      if (!owner) throw new Error("Owner registration failed");
      const verification = randomBytes(24).toString("hex");
      await auth.createAuthToken(
        owner.user.id,
        "verify_email",
        verification,
        new Date(Date.now() + 60_000),
      );
      expect(await auth.verifyEmail(verification)).toBe(true);
      expect(await auth.verifyEmail(verification)).toBe(false);

      const grantId = `grant-${suffix}`;
      await database.sql`
        INSERT INTO oauth_records (model, id, payload)
        VALUES
          ('Grant', ${grantId}, ${JSON.stringify({ accountId: owner.user.id })}::jsonb),
          ('AccessToken', ${`access-${suffix}`}, ${JSON.stringify({ grantId })}::jsonb)
      `;
      const reset = randomBytes(24).toString("hex");
      await auth.createAuthToken(
        owner.user.id,
        "reset_password",
        reset,
        new Date(Date.now() + 60_000),
      );
      expect(await auth.resetPassword(reset, "new-owner-password-hash")).toBe(true);
      const oauthRows = await database.sql<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM oauth_records
        WHERE id IN (${grantId}, ${`access-${suffix}`})
      `;
      expect(oauthRows[0]?.count).toBe(0);

      const ownerActor = await store.loadActor(owner.user.id, "integration-test");
      expect(owner.teamId).not.toBe(owner.workspaceId);
      expect(ownerActor.teamRoles.get(owner.teamId)).toBe("owner");
      expect(ownerActor.workspaceRoles.get(owner.workspaceId)).toBe("owner");
      const brain = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `shared-${suffix}`,
          name: "Shared brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const secondWorkspace = await service.createWorkspace(
        owner.teamId,
        { name: "Second workspace" },
        ownerActor,
      );
      expect(secondWorkspace.llmCompactionEnabled).toBe(false);
      await expect(
        service.updateWorkspace(secondWorkspace.id, { llmCompactionEnabled: true }, ownerActor),
      ).rejects.toMatchObject({ code: "llm_unavailable", status: 409 });
      const llmService = new RementumService(
        store,
        {
          embedQuery: async () => ({ model: "test-model", vector: [] }),
          embedPassages: async () => ({ model: "test-model", vectors: [] }),
          healthy: async () => true,
        },
        Buffer.alloc(32, 7),
        {
          generateArticle: async () => ({
            title: "Compacted title",
            summary: "The article was compacted in the background.",
            body: "# Compacted title\n\nGenerated compact body.",
          }),
        },
        true,
      );
      const enabledWorkspace = await llmService.updateWorkspace(
        secondWorkspace.id,
        { llmCompactionEnabled: true },
        ownerActor,
      );
      expect(enabledWorkspace.llmCompactionEnabled).toBe(true);
      const existingWrite = await llmService.stageWrite(
        {
          brainId: brain.brain.id,
          operation: "create",
          slug: `existing-${suffix}`,
          title: "Existing article",
          keywords: [],
          kind: "canonical",
          body: "Existing article body.",
          changeSummary: "Create existing article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        ownerActor,
      );
      const existingArticle = await llmService.promoteWrite(
        {
          writeId: existingWrite.id,
          decision: "promote",
          decisionSummary: "Approve existing article",
        },
        ownerActor,
      );
      expect(existingArticle.article.compactionStatus).toBe("not_requested");
      await llmService.updateWorkspace(
        owner.workspaceId,
        { llmCompactionEnabled: true },
        ownerActor,
      );
      await expect(
        llmService.queueWorkspaceCompactions(owner.workspaceId, ownerActor),
      ).resolves.toEqual({ queued: 1 });
      // Scoped to this brain: the suites share one database and run in parallel, so
      // an unscoped claim could lease a job another file had just queued.
      const existingClaim = await store.claimCompaction(
        `existing-worker-${suffix}`,
        120,
        brain.brain.id,
      );
      expect(existingClaim?.articleId).toBe(existingArticle.article.id);
      if (!existingClaim) throw new Error("Existing article was not queued");
      await llmService.compactClaimedJob(existingClaim, ownerActor);
      const secondBrain = await service.createBrain(
        {
          workspaceId: secondWorkspace.id,
          slug: `second-${suffix}`,
          name: "Second workspace brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const staged = await llmService.stageWrite(
        {
          brainId: secondBrain.brain.id,
          operation: "create",
          slug: `deferred-${suffix}`,
          title: "Deferred compaction",
          keywords: [],
          kind: "canonical",
          body: "The original body remains readable while compaction is queued.",
          changeSummary: "Create deferred compaction article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        ownerActor,
      );
      const promoted = await llmService.promoteWrite(
        {
          writeId: staged.id,
          decision: "promote",
          decisionSummary: "Approve deferred compaction article",
        },
        ownerActor,
      );
      expect(promoted.article.compactionStatus).toBe("queued");
      const claim = await store.claimCompaction(
        `integration-worker-${suffix}`,
        120,
        secondBrain.brain.id,
      );
      expect(claim).toMatchObject({
        articleId: promoted.article.id,
        articleVersion: 1,
        sourceTitle: "Deferred compaction",
        attempts: 1,
      });
      if (!claim) throw new Error("Compaction claim was not created");
      await expect(
        llmService.getArticleCompaction(promoted.article.id, ownerActor),
      ).resolves.toMatchObject({ status: "processing", attempts: 1 });
      await llmService.compactClaimedJob(claim, ownerActor);
      const compacted = await llmService.readArticle(promoted.article.id, ownerActor);
      expect(compacted).toMatchObject({
        title: "Compacted title",
        summary: "The article was compacted in the background.",
        body: "# Compacted title\n\nGenerated compact body.",
        compaction: { status: "compacted", attempts: 1 },
        currentVersion: 2,
      });
      // The submitted version stays in history; only the current version was replaced.
      const history = await llmService.listArticleHistory(promoted.article.id, ownerActor);
      expect(history.map((entry) => entry.version)).toEqual([2, 1]);
      expect(history[1]?.bodyHash).toBe(
        hashContent("The original body remains readable while compaction is queued."),
      );
      expect(history[0]?.changeSummary).toBe("Compacted version 1");
      const cancelledWrite = await llmService.stageWrite(
        {
          brainId: secondBrain.brain.id,
          operation: "create",
          slug: `cancelled-${suffix}`,
          title: "Cancelled compaction",
          keywords: [],
          kind: "canonical",
          body: "This body must remain unchanged after queued compaction is cancelled.",
          changeSummary: "Create cancellation article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        ownerActor,
      );
      const cancelledArticle = await llmService.promoteWrite(
        {
          writeId: cancelledWrite.id,
          decision: "promote",
          decisionSummary: "Approve cancellation article",
        },
        ownerActor,
      );
      const cancelledClaim = await store.claimCompaction(
        `cancel-worker-${suffix}`,
        120,
        secondBrain.brain.id,
      );
      expect(cancelledClaim?.articleId).toBe(cancelledArticle.article.id);
      if (!cancelledClaim) throw new Error("Cancellation article was not claimed");
      await llmService.updateWorkspace(
        secondWorkspace.id,
        { llmCompactionEnabled: false },
        ownerActor,
      );
      await expect(llmService.compactClaimedJob(cancelledClaim, ownerActor)).resolves.toBeNull();
      await expect(
        llmService.readArticle(cancelledArticle.article.id, ownerActor),
      ).resolves.toMatchObject({
        body: "This body must remain unchanged after queued compaction is cancelled.",
        compaction: { status: "disabled" },
      });

      const retryWrite = await llmService.stageWrite(
        {
          brainId: brain.brain.id,
          operation: "create",
          slug: `retry-${suffix}`,
          title: "Retry compaction",
          keywords: [],
          kind: "canonical",
          body: "This article fails compaction until the maintenance pass requeues it.",
          changeSummary: "Create retry article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        ownerActor,
      );
      const retryArticle = await llmService.promoteWrite(
        {
          writeId: retryWrite.id,
          decision: "promote",
          decisionSummary: "Approve retry article",
        },
        ownerActor,
      );
      expect(retryArticle.article.compactionStatus).toBe("queued");
      // A zero-second lease lets each reclaim count as an expired attempt without waiting
      // out the failure backoff, driving the job to its terminal third attempt.
      let retryClaim = await store.claimCompaction(`retry-worker-${suffix}`, 0, brain.brain.id);
      expect(retryClaim).toMatchObject({ articleId: retryArticle.article.id, attempts: 1 });
      for (let attempt = 2; attempt <= 3; attempt += 1) {
        retryClaim = await store.claimCompaction(`retry-worker-${suffix}`, 0, brain.brain.id);
        expect(retryClaim).toMatchObject({
          articleId: retryArticle.article.id,
          attempts: attempt,
        });
      }
      if (!retryClaim) throw new Error("Retry article was not claimed");
      await llmService.failClaimedCompaction(
        retryClaim,
        new Error("provider unavailable"),
        ownerActor,
      );
      await expect(
        llmService.getArticleCompaction(retryArticle.article.id, ownerActor),
      ).resolves.toMatchObject({ status: "failed", attempts: 3 });
      const cooledDown = await database.sql<Array<{ article_id: string; owner_id: string }>>`
        SELECT * FROM owl_worker_failed_compactions(0, 100)
      `;
      expect(cooledDown).toContainEqual(
        expect.objectContaining({
          article_id: retryArticle.article.id,
          owner_id: owner.user.id,
        }),
      );
      const withinCooldown = await database.sql<Array<{ article_id: string }>>`
        SELECT * FROM owl_worker_failed_compactions(3600, 100)
      `;
      expect(withinCooldown.map((row) => row.article_id)).not.toContain(retryArticle.article.id);
      await expect(
        llmService.queueArticleCompaction(retryArticle.article.id, ownerActor),
      ).resolves.toMatchObject({ status: "queued" });
      const requeuedClaim = await store.claimCompaction(
        `retry-worker-${suffix}`,
        120,
        brain.brain.id,
      );
      expect(requeuedClaim).toMatchObject({ articleId: retryArticle.article.id, attempts: 1 });
      if (!requeuedClaim) throw new Error("Requeued job was not claimed");
      await llmService.compactClaimedJob(requeuedClaim, ownerActor);
      await expect(
        llmService.readArticle(retryArticle.article.id, ownerActor),
      ).resolves.toMatchObject({ compaction: { status: "compacted" } });

      const member = await auth.registerAccount(
        `member-${suffix}@example.test`,
        "Member",
        "member-password-hash",
        "Personal team",
        `personal-${suffix}`,
      );
      if (!member) throw new Error("Member registration failed");
      let memberActor = await store.loadActor(member.user.id, "integration-test");
      const personalBrain = await service.createBrain(
        {
          workspaceId: member.workspaceId,
          slug: `personal-${suffix}`,
          name: "Personal brain",
          description: "",
          instructions: "",
        },
        memberActor,
      );
      const invitation = await service.proposeTeamInvite(
        owner.teamId,
        member.user.email,
        "member",
        ownerActor,
      );
      await auth.acceptTeamInvitation(hashContent(invitation.token), member.user.id, null, null);

      memberActor = await store.loadActor(member.user.id, "integration-test");
      expect(memberActor.teamRoles.get(owner.teamId)).toBe("member");
      expect(memberActor.workspaceRoles.get(owner.workspaceId)).toBe("member");
      expect(memberActor.workspaceRoles.get(secondWorkspace.id)).toBe("member");
      expect(memberActor.brainRoles.get(brain.brain.id)).toBe("editor");
      expect(memberActor.brainRoles.get(secondBrain.brain.id)).toBe("editor");
      await expect(
        service.createWorkspace(owner.teamId, { name: "Member cannot create" }, memberActor),
      ).rejects.toMatchObject({ code: "forbidden" });
      const scopedMember = await store.scopeActorToWorkspace(memberActor, owner.workspaceId);
      expect([...scopedMember.teamRoles.keys()]).toEqual([owner.teamId]);
      expect([...scopedMember.workspaceRoles.keys()]).toEqual([owner.workspaceId]);
      expect(scopedMember.brainRoles.get(brain.brain.id)).toBe("editor");
      expect(scopedMember.brainRoles.has(personalBrain.brain.id)).toBe(false);
      await expect(
        service.createBrain(
          {
            workspaceId: secondWorkspace.id,
            slug: `blocked-${suffix}`,
            name: "Blocked brain",
            description: "",
            instructions: "",
          },
          scopedMember,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });

      const guest = await auth.registerAccount(
        `guest-${suffix}@example.test`,
        "Guest",
        "guest-password-hash",
        "Guest personal team",
        `guest-${suffix}`,
      );
      if (!guest) throw new Error("Guest registration failed");
      const brainInvitation = await service.proposeInvite(
        brain.brain.id,
        guest.user.email,
        "viewer",
        ownerActor,
      );
      await auth.acceptBrainInvitation(
        hashContent(brainInvitation.token),
        guest.user.id,
        null,
        null,
      );
      const guestActor = await store.loadActor(guest.user.id, "integration-test");
      expect(guestActor.workspaceRoles.has(owner.workspaceId)).toBe(false);
      expect(guestActor.brainRoles.get(brain.brain.id)).toBe("viewer");

      await service.updateTeamMemberRole(owner.teamId, member.user.id, "admin", ownerActor);
      memberActor = await store.loadActor(member.user.id, "integration-test");
      expect(memberActor.brainRoles.get(brain.brain.id)).toBe("owner");
      expect(memberActor.brainRoles.get(secondBrain.brain.id)).toBe("owner");

      await service.removeTeamMember(owner.teamId, member.user.id, ownerActor);
      memberActor = await store.loadActor(member.user.id, "integration-test");
      expect(memberActor.teamRoles.has(owner.teamId)).toBe(false);
      expect(memberActor.workspaceRoles.has(owner.workspaceId)).toBe(false);
      expect(memberActor.workspaceRoles.has(secondWorkspace.id)).toBe(false);
      expect(memberActor.brainRoles.has(brain.brain.id)).toBe(false);
      expect(memberActor.brainRoles.has(secondBrain.brain.id)).toBe(false);
      await expect(
        store.scopeActorToWorkspace(memberActor, owner.workspaceId),
      ).rejects.toMatchObject({ code: "forbidden" });

      const renamedWorkspace = await service.updateWorkspace(
        secondWorkspace.id,
        { name: "Renamed workspace" },
        ownerActor,
      );
      expect(renamedWorkspace.name).toBe("Renamed workspace");
      expect(renamedWorkspace.slug).toMatch(/^renamed-workspace-/);

      const renamedTeam = await service.updateTeam(
        owner.teamId,
        { name: "Renamed primary team" },
        ownerActor,
      );
      expect(renamedTeam.name).toBe("Renamed primary team");
      expect(renamedTeam.slug).toMatch(/^renamed-primary-team-/);

      await expect(
        service.deleteWorkspace(secondWorkspace.id, "Wrong name", ownerActor),
      ).rejects.toMatchObject({ code: "conflict" });
      await service.deleteWorkspace(secondWorkspace.id, "Renamed workspace", ownerActor);
      expect(await store.getBrain(secondBrain.brain.id, ownerActor)).toBeNull();
      await expect(
        service.deleteWorkspace(owner.workspaceId, "Default workspace", ownerActor),
      ).rejects.toMatchObject({ code: "conflict" });
    } finally {
      await database.close();
    }
  }, 30_000);
});
