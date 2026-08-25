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

      const member = await auth.registerAccount(
        `member-${suffix}@example.test`,
        "Member",
        "member-password-hash",
        "Personal team",
        `personal-${suffix}`,
      );
      if (!member) throw new Error("Member registration failed");
      const invitation = await service.proposeTeamInvite(
        owner.workspaceId,
        member.user.email,
        "member",
        ownerActor,
      );
      await auth.acceptTeamInvitation(hashContent(invitation.token), member.user.id, null, null);

      let memberActor = await store.loadActor(member.user.id, "integration-test");
      expect(memberActor.workspaceRoles.get(owner.workspaceId)).toBe("member");
      expect(memberActor.brainRoles.get(brain.brain.id)).toBe("editor");

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

      await service.updateTeamMemberRole(owner.workspaceId, member.user.id, "admin", ownerActor);
      memberActor = await store.loadActor(member.user.id, "integration-test");
      expect(memberActor.brainRoles.get(brain.brain.id)).toBe("owner");

      await service.removeTeamMember(owner.workspaceId, member.user.id, ownerActor);
      memberActor = await store.loadActor(member.user.id, "integration-test");
      expect(memberActor.workspaceRoles.has(owner.workspaceId)).toBe(false);
      expect(memberActor.brainRoles.has(brain.brain.id)).toBe(false);
    } finally {
      await database.close();
    }
  }, 30_000);
});
