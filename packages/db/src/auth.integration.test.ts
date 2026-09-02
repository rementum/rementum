import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuthRepository, OidcPostgresAdapter } from "./auth.js";
import { createDatabaseClient } from "./client.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("OidcPostgresAdapter", () => {
  it("stores, finds, consumes, and destroys a record", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const suffix = randomBytes(6).toString("hex");
    const adapter = new OidcPostgresAdapter("AuthorizationCode", database.sql);
    const id = `code-${suffix}`;

    try {
      expect(await adapter.find(id)).toBeUndefined();

      await adapter.upsert(id, { uid: `uid-${suffix}`, grantId: `grant-${suffix}` }, 300);
      expect(await adapter.find(id)).toMatchObject({ uid: `uid-${suffix}` });
      expect(await adapter.findByUid(`uid-${suffix}`)).toMatchObject({ uid: `uid-${suffix}` });
      expect(await adapter.findByUid("no-such-uid")).toBeUndefined();

      // A consumed code is still readable, but carries the timestamp that makes replay visible.
      await adapter.consume(id);
      const consumed = await adapter.find(id);
      expect(consumed?.consumed).toBeTypeOf("number");

      // Re-issuing the same id clears the consumption marker.
      await adapter.upsert(id, { uid: `uid-${suffix}`, grantId: `grant-${suffix}` }, 300);
      expect(await adapter.find(id)).not.toHaveProperty("consumed");

      await adapter.destroy(id);
      expect(await adapter.find(id)).toBeUndefined();
    } finally {
      await database.close();
    }
  }, 30_000);

  it("hides an expired record and forgets every token of a revoked grant", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const suffix = randomBytes(6).toString("hex");
    const codes = new OidcPostgresAdapter("AuthorizationCode", database.sql);
    const tokens = new OidcPostgresAdapter("AccessToken", database.sql);
    const grantId = `grant-${suffix}`;

    try {
      await codes.upsert(`expired-${suffix}`, { uid: `uid-${suffix}` }, -1);
      expect(await codes.find(`expired-${suffix}`)).toBeUndefined();
      expect(await codes.findByUid(`uid-${suffix}`)).toBeUndefined();

      // A zero lifetime means no expiry at all, which is how sessions are stored.
      await codes.upsert(`eternal-${suffix}`, { uid: `eternal-uid-${suffix}` }, 0);
      expect(await codes.find(`eternal-${suffix}`)).toBeDefined();

      await tokens.upsert(`access-a-${suffix}`, { grantId }, 300);
      await tokens.upsert(`access-b-${suffix}`, { grantId }, 300);
      await tokens.upsert(`access-other-${suffix}`, { grantId: `other-${suffix}` }, 300);
      await tokens.revokeByGrantId(grantId);
      expect(await tokens.find(`access-a-${suffix}`)).toBeUndefined();
      expect(await tokens.find(`access-b-${suffix}`)).toBeUndefined();
      expect(await tokens.find(`access-other-${suffix}`)).toBeDefined();
    } finally {
      await database.close();
    }
  }, 30_000);

  it("keeps each model in its own namespace", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const suffix = randomBytes(6).toString("hex");
    const codes = new OidcPostgresAdapter("AuthorizationCode", database.sql);
    const sessions = new OidcPostgresAdapter("Session", database.sql);

    try {
      await codes.upsert(`shared-${suffix}`, { kind: "code" }, 300);
      await sessions.upsert(`shared-${suffix}`, { kind: "session" }, 300);
      expect(await codes.find(`shared-${suffix}`)).toMatchObject({ kind: "code" });
      expect(await sessions.find(`shared-${suffix}`)).toMatchObject({ kind: "session" });
      await codes.destroy(`shared-${suffix}`);
      expect(await sessions.find(`shared-${suffix}`)).toMatchObject({ kind: "session" });
    } finally {
      await database.close();
    }
  }, 30_000);
});

integration("AuthRepository", () => {
  it("keeps a web session usable only while it is live", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const suffix = randomBytes(6).toString("hex");

    try {
      const account = await auth.registerAccount(
        `session-${suffix}@example.test`,
        "Session owner",
        "password-hash",
        "Session team",
        `session-${suffix}`,
      );
      if (!account) throw new Error("Registration failed");

      const live = `live-${suffix}`;
      await auth.createWebSession(account.user.id, live, new Date(Date.now() + 60_000));
      expect(await auth.findWebSession(live)).toEqual({
        userId: account.user.id,
        systemOwner: false,
      });

      const expired = `expired-${suffix}`;
      await auth.createWebSession(account.user.id, expired, new Date(Date.now() - 1_000));
      expect(await auth.findWebSession(expired)).toBeNull();

      await auth.revokeWebSession(live);
      expect(await auth.findWebSession(live)).toBeNull();
      expect(await auth.findWebSession(`never-issued-${suffix}`)).toBeNull();
    } finally {
      await database.close();
    }
  }, 30_000);

  it("refuses to register the same address twice", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const suffix = randomBytes(6).toString("hex");
    const email = `duplicate-${suffix}@example.test`;

    try {
      expect(
        await auth.registerAccount(email, "First", "hash", "First team", `first-${suffix}`),
      ).not.toBeNull();
      expect(
        await auth.registerAccount(email, "Second", "hash", "Second team", `second-${suffix}`),
      ).toBeNull();
      const user = await auth.findUserByEmail(email);
      expect(user?.displayName).toBe("First");
      expect(await auth.findUserById(user?.id ?? "")).toMatchObject({ email });
      expect(await auth.findUserByEmail(`absent-${suffix}@example.test`)).toBeNull();
    } finally {
      await database.close();
    }
  }, 30_000);

  it("lists a connected client and forgets its tokens when it is revoked", async () => {
    if (!databaseUrl) return;
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);
    const suffix = randomBytes(6).toString("hex");

    try {
      const account = await auth.registerAccount(
        `connections-${suffix}@example.test`,
        "Connection owner",
        "password-hash",
        "Connection team",
        `connections-${suffix}`,
      );
      if (!account) throw new Error("Registration failed");
      const grantId = `grant-${suffix}`;
      const clientId = `client-${suffix}`;
      const clients = new OidcPostgresAdapter("Client", database.sql);
      const grants = new OidcPostgresAdapter("Grant", database.sql);
      const tokens = new OidcPostgresAdapter("AccessToken", database.sql);

      await clients.upsert(clientId, { clientId, clientName: "Claude Code" }, 0);
      await grants.upsert(
        grantId,
        {
          accountId: account.user.id,
          clientId,
          iat: Math.floor(Date.now() / 1000),
          openid: { scope: "brain:read brain:write" },
          resources: { "https://rementum.example.test/mcp": "brain:read" },
        },
        0,
      );
      await tokens.upsert(`access-${suffix}`, { grantId }, 300);

      const connections = await auth.listConnections(account.user.id);
      expect(connections).toEqual([
        {
          grantId,
          clientId,
          clientName: "Claude Code",
          scopes: ["brain:read", "brain:write"],
          resources: { "https://rementum.example.test/mcp": "brain:read" },
        },
      ]);

      // Another account cannot revoke a grant it does not own.
      const stranger = await auth.registerAccount(
        `stranger-${suffix}@example.test`,
        "Stranger",
        "password-hash",
        "Stranger team",
        `stranger-conn-${suffix}`,
      );
      if (!stranger) throw new Error("Registration failed");
      expect(await auth.revokeConnection(stranger.user.id, grantId)).toBe(false);
      expect(await auth.listConnections(account.user.id)).toHaveLength(1);

      expect(await auth.revokeConnection(account.user.id, grantId)).toBe(true);
      expect(await auth.listConnections(account.user.id)).toEqual([]);
      expect(await tokens.find(`access-${suffix}`)).toBeUndefined();
      expect(await auth.revokeConnection(account.user.id, grantId)).toBe(false);
    } finally {
      await database.close();
    }
  }, 30_000);
});
