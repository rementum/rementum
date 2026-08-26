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
        embedQuery: async () => [],
        embedPassages: async () => [],
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
