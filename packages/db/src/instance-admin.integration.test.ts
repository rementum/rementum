import { randomBytes } from "node:crypto";
import { instanceOverviewSchema, instanceUsersPageSchema } from "@rementum/contracts";
import { ForbiddenError, hashContent, RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("instance administration", () => {
  it("opens cross-tenant counts to the system owner only, at both layers", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const store = new PostgresStore(database);
    const service = new RementumService(
      store,
      {
        embedQuery: async () => ({ model: "test-model", vector: [] }),
        embedPassages: async () => ({ model: "test-model", vectors: [] }),
        healthy: async () => false,
      },
      Buffer.alloc(32, 7),
    );
    const suffix = randomBytes(6).toString("hex");

    try {
      const owner = await auth.registerAccount(
        `instance-owner-${suffix}@example.test`,
        "Instance owner",
        "owner-password-hash",
        "Owner team",
        `instance-owner-${suffix}`,
      );
      const member = await auth.registerAccount(
        `instance-member-${suffix}@example.test`,
        "Ordinary member",
        "member-password-hash",
        "Member team",
        `instance-member-${suffix}`,
      );
      if (!owner || !member) throw new Error("Account registration failed");
      // The shared test database already has a first owner, so createOwner refuses; the
      // flag is set the way an operator would, straight on the row.
      await database.sql`UPDATE users SET system_owner = true WHERE id = ${owner.user.id}`;

      const ownerActor = await store.loadActor(owner.user.id, "owner-browser");
      const memberActor = await store.loadActor(member.user.id, "member-browser");
      expect(ownerActor.systemOwner).toBe(true);
      expect(memberActor.systemOwner).toBe(false);

      // Instance authority does not follow a token narrowed to one workspace.
      const scoped = await store.scopeActorToWorkspace(ownerActor, owner.workspaceId);
      expect(scoped.systemOwner).toBe(false);

      const sessionToken = randomBytes(32).toString("base64url");
      await auth.createWebSession(
        owner.user.id,
        hashContent(sessionToken),
        new Date(Date.now() + 60_000),
      );
      await expect(auth.findWebSession(hashContent(sessionToken))).resolves.toEqual({
        userId: owner.user.id,
        systemOwner: true,
      });

      const overview = instanceOverviewSchema.parse(await service.getInstanceOverview(ownerActor));
      expect(overview.accounts.total).toBeGreaterThanOrEqual(2);
      expect(overview.accounts.systemOwners).toBeGreaterThanOrEqual(1);
      expect(overview.accounts.newLast7Days).toBeGreaterThanOrEqual(2);
      expect(overview.knowledge.teams).toBeGreaterThanOrEqual(2);
      expect(overview.knowledge.workspaces).toBeGreaterThanOrEqual(2);
      expect(overview.usage.webSessions).toBeGreaterThanOrEqual(1);
      expect(overview.storage.databaseBytes).toBeGreaterThan(0);
      expect(overview.daily).toHaveLength(30);
      const today = overview.daily.at(-1);
      expect(today?.date).toBe(overview.generatedAt.slice(0, 10));
      expect(today?.signups).toBeGreaterThanOrEqual(2);

      const page = instanceUsersPageSchema.parse(
        await service.listInstanceUsers({ query: suffix, limit: 50, offset: 0 }, ownerActor),
      );
      expect(page.total).toBe(2);
      expect(page.items.map((item) => item.email)).toEqual([
        `instance-member-${suffix}@example.test`,
        `instance-owner-${suffix}@example.test`,
      ]);
      const ownerRow = page.items.find((item) => item.id === owner.user.id);
      expect(ownerRow).toMatchObject({ systemOwner: true, teams: 1, mcpConnections: 0 });
      expect(page.items.find((item) => item.id === member.user.id)?.systemOwner).toBe(false);

      // Wildcards in the search are literal characters, not patterns.
      const literal = await service.listInstanceUsers(
        { query: `instance-%-${suffix}`, limit: 50, offset: 0 },
        ownerActor,
      );
      expect(literal.total).toBe(0);
      const paged = await service.listInstanceUsers(
        { query: suffix, limit: 1, offset: 1 },
        ownerActor,
      );
      expect(paged.total).toBe(2);
      expect(paged.items).toHaveLength(1);
      expect(paged.items[0]?.id).toBe(owner.user.id);

      const audited = await database.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.user_id', ${owner.user.id}, true)`;
        return tx<Array<{ detail: { query: string; returned: number } }>>`
          SELECT detail FROM audit_events
          WHERE actor_id = ${owner.user.id} AND action = 'instance.accounts_listed'
          ORDER BY created_at ASC
        `;
      });
      expect(audited.length).toBeGreaterThanOrEqual(3);
      expect(audited[0]?.detail).toMatchObject({ query: suffix, returned: 2 });

      await expect(service.getInstanceOverview(memberActor)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        service.listInstanceUsers({ query: "", limit: 50, offset: 0 }, memberActor),
      ).rejects.toBeInstanceOf(ForbiddenError);

      // A forged flag on the actor gets past the service; the database still says no.
      const forged = { ...memberActor, systemOwner: true };
      await expect(store.getInstanceOverview(forged)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        store.listInstanceUsers({ query: "", limit: 50, offset: 0 }, forged),
      ).rejects.toBeInstanceOf(ForbiddenError);
      const direct = database.sql.begin(async (tx) => {
        await tx`SELECT set_config('app.user_id', ${member.user.id}, true)`;
        await tx`SELECT owl_instance_overview()`;
      });
      await expect(direct).rejects.toMatchObject({ code: "42501" });
    } finally {
      await database.close();
    }
  });
});
