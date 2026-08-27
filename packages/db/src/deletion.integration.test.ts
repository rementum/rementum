import { randomBytes } from "node:crypto";
import type { Actor } from "@rementum/core";
import { ConflictError, NotFoundError, RementumService } from "@rementum/core";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth.js";
import { createDatabaseClient } from "./client.js";
import { PostgresStore } from "./store.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("brain and team deletion", () => {
  it("lets only the brain owner hard-delete a brain, cascading its articles", async () => {
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
        healthy: async () => false,
      },
      Buffer.alloc(32, 7),
    );

    try {
      const owner = await auth.registerAccount(
        `owner-${suffix}@example.test`,
        "Owner",
        "owner-password-hash",
        "Delete team",
        `delete-${suffix}`,
      );
      if (!owner) throw new Error("Owner registration failed");
      const ownerActor = await store.loadActor(owner.user.id, "integration-test");
      const brain = await service.createBrain(
        {
          workspaceId: owner.workspaceId,
          slug: `doomed-${suffix}`,
          name: "Doomed brain",
          description: "",
          instructions: "",
        },
        ownerActor,
      );
      const brainId = brain.brain.id;
      const write = await service.stageWrite(
        {
          brainId,
          operation: "create",
          slug: `only-article-${suffix}`,
          title: "Only article",
          keywords: [],
          kind: "canonical",
          body: "This body must become unreadable once the brain is deleted.",
          changeSummary: "Create the only article",
          sources: [],
          acknowledgePotentialConflicts: false,
        },
        ownerActor,
      );
      const promoted = await service.promoteWrite(
        { writeId: write.id, decision: "promote", decisionSummary: "Approve" },
        ownerActor,
      );
      const articleId = promoted.article.id;

      // The worker helper runs as definer and sees every article that still exists, so it
      // can distinguish a cascade-deleted row from one row-level security merely hides.
      const before = await database.sql<Array<{ article_id: string }>>`
        SELECT article_id FROM owl_worker_unindexed_articles(1000, 'no-such-model')
      `;
      expect(before.map((row) => row.article_id)).toContain(articleId);

      // With no actor configuration the connection has no row-level security context, so
      // the delete must reach nothing even though the role holds table privileges.
      const bareDelete = await database.sql<Array<{ id: string }>>`
        DELETE FROM brains WHERE id = ${brainId} RETURNING id
      `;
      expect(bareDelete).toEqual([]);

      // An editor passes the read policy but not brains_delete, so the row survives and
      // the store reports the delete as having found nothing.
      const editorActor: Actor = {
        userId: owner.user.id,
        clientId: "integration-test",
        teamRoles: new Map(),
        workspaceRoles: new Map(),
        brainRoles: new Map([[brainId, "editor"]]),
      };
      await expect(store.deleteBrain(brainId, "Doomed brain", editorActor)).rejects.toThrow(
        NotFoundError,
      );

      await expect(service.deleteBrain(brainId, "Wrong name", ownerActor)).rejects.toThrow(
        ConflictError,
      );

      await expect(
        service.deleteBrain(brainId, "Doomed brain", ownerActor),
      ).resolves.toBeUndefined();

      const reloaded = await store.loadActor(owner.user.id, "integration-test");
      expect(reloaded.brainRoles.has(brainId)).toBe(false);
      await expect(store.getBrain(brainId, reloaded)).resolves.toBeNull();
      const after = await database.sql<Array<{ article_id: string }>>`
        SELECT article_id FROM owl_worker_unindexed_articles(1000, 'no-such-model')
      `;
      expect(after.map((row) => row.article_id)).not.toContain(articleId);
    } finally {
      await database.close();
    }
  });

  it("lets only the team owner delete a team, and never their last one", async () => {
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
        healthy: async () => false,
      },
      Buffer.alloc(32, 7),
    );

    try {
      const owner = await auth.registerAccount(
        `solo-${suffix}@example.test`,
        "Solo",
        "solo-password-hash",
        "First team",
        `first-${suffix}`,
      );
      if (!owner) throw new Error("Registration failed");
      let actor = await store.loadActor(owner.user.id, "integration-test");

      await expect(service.deleteTeam(owner.teamId, "First team", actor)).rejects.toThrow(
        ConflictError,
      );

      const second = await service.createTeam({ name: "Second team" }, actor);
      actor = await store.loadActor(owner.user.id, "integration-test");
      const brain = await service.createBrain(
        {
          workspaceId: second.defaultWorkspaceId,
          slug: `second-${suffix}`,
          name: "Second brain",
          description: "",
          instructions: "",
        },
        actor,
      );

      await expect(service.deleteTeam(second.id, "Wrong name", actor)).rejects.toThrow(
        ConflictError,
      );

      // A plain member passes every application-level check the store makes, so the delete
      // itself has to be stopped by the teams_delete policy.
      const memberActor: Actor = {
        userId: owner.user.id,
        clientId: "integration-test",
        teamRoles: new Map([
          [owner.teamId, "owner"],
          [second.id, "member"],
        ]),
        workspaceRoles: new Map(),
        brainRoles: new Map(),
      };
      await expect(store.deleteTeam(second.id, "Second team", memberActor)).rejects.toThrow(
        NotFoundError,
      );

      // The owner-immutability trigger must yield to the cascade of a genuine team delete.
      await expect(service.deleteTeam(second.id, "Second team", actor)).resolves.toBeUndefined();

      const reloaded = await store.loadActor(owner.user.id, "integration-test");
      expect(reloaded.teamRoles.has(second.id)).toBe(false);
      expect(reloaded.teamRoles.get(owner.teamId)).toBe("owner");
      expect(reloaded.workspaceRoles.has(second.defaultWorkspaceId)).toBe(false);
      await expect(store.getBrain(brain.brain.id, reloaded)).resolves.toBeNull();

      // The store never even attempts to remove an owner row, so drive the delete straight
      // at the table with the session settings a managing user would carry: the trigger
      // must still protect the owner row of a team that continues to exist.
      await expect(
        database.sql.begin(async (tx) => {
          await tx`
            SELECT
              set_config('app.user_id', ${owner.user.id}, true),
              set_config('app.team_ids', ${owner.teamId}, true),
              set_config('app.manage_team_ids', ${owner.teamId}, true)
          `;
          return tx`DELETE FROM team_members WHERE team_id = ${owner.teamId} AND role = 'owner'`;
        }),
      ).rejects.toThrow(/team_owner_is_immutable/);
    } finally {
      await database.close();
    }
  });
});
