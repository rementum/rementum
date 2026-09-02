import { randomUUID } from "node:crypto";
import type { BrainRole } from "@rementum/contracts";
import type postgres from "postgres";
import type { DatabaseClient } from "./client.js";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  systemOwner: boolean;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
}

export class AuthRepository {
  constructor(private readonly client: DatabaseClient) {}

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.client.sql<any[]>`
      SELECT * FROM users WHERE lower(email) = lower(${email}) AND disabled_at IS NULL
    `;
    return row ? mapUser(row) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const [row] = await this.client.sql<any[]>`
      SELECT * FROM users WHERE id = ${id} AND disabled_at IS NULL
    `;
    return row ? mapUser(row) : null;
  }

  async createOwner(
    email: string,
    displayName: string,
    passwordHash: string,
  ): Promise<{ user: UserRecord; teamId: string; workspaceId: string }> {
    return (await this.client.sql.begin(async (tx) => {
      const countRows = await tx<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM users`;
      if ((countRows[0]?.count ?? 0) > 0)
        throw new Error("The first owner has already been created");
      const [userRow] = await tx<any[]>`
        INSERT INTO users (email, display_name, password_hash, system_owner, email_verified_at)
        VALUES (${email}, ${displayName}, ${passwordHash}, true, now()) RETURNING *
      `;
      const teamId = randomUUID();
      const workspaceId = randomUUID();
      await tx`SELECT set_config('app.user_id', ${userRow.id}, true)`;
      await tx`SELECT set_config('app.team_ids', ${teamId}, true)`;
      await tx`SELECT set_config('app.manage_team_ids', ${teamId}, true)`;
      await tx`SELECT set_config('app.owner_team_ids', ${teamId}, true)`;
      await tx`SELECT set_config('app.workspace_ids', ${workspaceId}, true)`;
      const [team] = await tx<any[]>`
        INSERT INTO teams (id, slug, name, created_by)
        VALUES (${teamId}, 'default', 'Default team', ${userRow.id}) RETURNING id
      `;
      await tx`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (${teamId}, ${userRow.id}, 'owner')
      `;
      const [workspace] = await tx<any[]>`
        INSERT INTO workspaces (id, team_id, slug, name, created_by)
        VALUES (${workspaceId}, ${teamId}, 'default', 'Default workspace', ${userRow.id}) RETURNING id
      `;
      return {
        user: mapUser(userRow),
        teamId: team.id as string,
        workspaceId: workspace.id as string,
      };
    })) as { user: UserRecord; teamId: string; workspaceId: string };
  }

  async registerAccount(
    email: string,
    displayName: string,
    passwordHash: string,
    teamName: string,
    teamSlug: string,
  ): Promise<{ user: UserRecord; teamId: string; workspaceId: string } | null> {
    return (await this.client.sql.begin(async (tx) => {
      const [userRow] = await tx<any[]>`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (${email}, ${displayName}, ${passwordHash})
        ON CONFLICT ((lower(email))) DO NOTHING
        RETURNING *
      `;
      if (!userRow) return null;
      const teamId = randomUUID();
      const workspaceId = randomUUID();
      await tx`SELECT set_config('app.user_id', ${userRow.id}, true)`;
      await tx`SELECT set_config('app.team_ids', ${teamId}, true)`;
      await tx`SELECT set_config('app.manage_team_ids', ${teamId}, true)`;
      await tx`SELECT set_config('app.owner_team_ids', ${teamId}, true)`;
      await tx`SELECT set_config('app.workspace_ids', ${workspaceId}, true)`;
      await tx`SELECT set_config('app.manage_workspace_ids', ${workspaceId}, true)`;
      await tx`SELECT set_config('app.owner_workspace_ids', ${workspaceId}, true)`;
      await tx<any[]>`
        INSERT INTO teams (id, slug, name, created_by)
        VALUES (${teamId}, ${teamSlug}, ${teamName}, ${userRow.id})
      `;
      await tx`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (${teamId}, ${userRow.id}, 'owner')
      `;
      await tx`
        INSERT INTO workspaces (id, team_id, slug, name, created_by)
        VALUES (${workspaceId}, ${teamId}, 'default', 'Default workspace', ${userRow.id})
      `;
      return { user: mapUser(userRow), teamId, workspaceId };
    })) as { user: UserRecord; teamId: string; workspaceId: string } | null;
  }

  /**
   * Re-registers an address whose account was never verified: the new password and name
   * replace the old ones and the caller issues a fresh verification. A verified account
   * is left untouched and null is returned, exactly as for an address that is free.
   */
  async reclaimUnverifiedAccount(
    email: string,
    displayName: string,
    passwordHash: string,
  ): Promise<UserRecord | null> {
    const [row] = await this.client.sql<any[]>`
      UPDATE users SET password_hash = ${passwordHash}, display_name = ${displayName}
      WHERE lower(email) = lower(${email}) AND email_verified_at IS NULL AND disabled_at IS NULL
      RETURNING *
    `;
    return row ? mapUser(row) : null;
  }

  async createAuthToken(
    userId: string,
    purpose: "verify_email" | "reset_password",
    tokenHash: string,
    expiresAt: Date,
  ): Promise<{ id: string }> {
    return (await this.client.sql.begin(async (tx) => {
      await tx`
        UPDATE auth_tokens SET consumed_at = now()
        WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
      `;
      const [row] = await tx<Array<{ id: string }>>`
        INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
        VALUES (${userId}, ${purpose}, ${tokenHash}, ${expiresAt.toISOString()})
        RETURNING id
      `;
      if (!row) throw new Error("Auth token insert did not return a row");
      return row;
    })) as { id: string };
  }

  async verifyEmail(tokenHash: string): Promise<boolean> {
    return (await this.client.sql.begin(async (tx) => {
      const [token] = await tx<Array<{ id: string; user_id: string }>>`
        SELECT id, user_id FROM auth_tokens
        WHERE token_hash = ${tokenHash} AND purpose = 'verify_email'
          AND consumed_at IS NULL AND expires_at > now()
        FOR UPDATE
      `;
      if (!token) return false;
      await tx`UPDATE users SET email_verified_at = now() WHERE id = ${token.user_id}`;
      await tx`UPDATE auth_tokens SET consumed_at = now() WHERE id = ${token.id}`;
      return true;
    })) as boolean;
  }

  async resetPassword(tokenHash: string, passwordHash: string): Promise<boolean> {
    return (await this.client.sql.begin(async (tx) => {
      const [token] = await tx<Array<{ id: string; user_id: string }>>`
        SELECT id, user_id FROM auth_tokens
        WHERE token_hash = ${tokenHash} AND purpose = 'reset_password'
          AND consumed_at IS NULL AND expires_at > now()
        FOR UPDATE
      `;
      if (!token) return false;
      const grants = await tx<Array<{ id: string }>>`
        SELECT id FROM oauth_records
        WHERE model = 'Grant' AND payload->>'accountId' = ${token.user_id}
      `;
      const grantIds = grants.map((grant) => grant.id);
      if (grantIds.length) {
        await tx`DELETE FROM oauth_records WHERE payload->>'grantId' = ANY(${grantIds})`;
      }
      await tx`DELETE FROM oauth_records WHERE payload->>'accountId' = ${token.user_id}`;
      await tx`DELETE FROM web_sessions WHERE user_id = ${token.user_id}`;
      await tx`
        UPDATE users SET password_hash = ${passwordHash}, email_verified_at = coalesce(email_verified_at, now())
        WHERE id = ${token.user_id}
      `;
      await tx`UPDATE auth_tokens SET consumed_at = now() WHERE user_id = ${token.user_id}`;
      return true;
    })) as boolean;
  }

  async createWebSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.client.sql.begin(async (tx) => {
      await tx`DELETE FROM web_sessions WHERE expires_at <= now()`;
      await tx`
        INSERT INTO web_sessions (user_id, token_hash, expires_at)
        VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
      `;
    });
  }

  async findWebSession(tokenHash: string): Promise<{ userId: string } | null> {
    const [row] = await this.client.sql<Array<{ user_id: string }>>`
      SELECT sessions.user_id
      FROM web_sessions sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ${tokenHash}
        AND sessions.expires_at > now()
        AND users.disabled_at IS NULL
    `;
    return row ? { userId: row.user_id } : null;
  }

  async revokeWebSession(tokenHash: string): Promise<void> {
    await this.client.sql`DELETE FROM web_sessions WHERE token_hash = ${tokenHash}`;
  }

  async inspectTeamInvitation(tokenHash: string) {
    const [row] = await this.client.sql<
      any[]
    >`SELECT * FROM owl_inspect_team_invitation(${tokenHash})`;
    return row
      ? {
          teamId: row.team_id as string,
          name: row.team_name as string,
          email: row.invite_email as string,
          role: row.invite_role as "admin" | "member",
        }
      : null;
  }

  async inspectBrainInvitation(tokenHash: string) {
    const [row] = await this.client.sql<
      any[]
    >`SELECT * FROM owl_inspect_brain_invitation(${tokenHash})`;
    return row
      ? {
          brainId: row.brain_id as string,
          name: row.brain_name as string,
          email: row.invite_email as string,
          role: row.invite_role as BrainRole,
        }
      : null;
  }

  async acceptTeamInvitation(
    tokenHash: string,
    userId: string | null,
    displayName: string | null,
    passwordHash: string | null,
  ) {
    const [row] = await this.client.sql<
      Array<{ user_id: string; user_email: string; team_id: string; workspace_id: string }>
    >`SELECT * FROM owl_accept_team_invitation(${tokenHash}, ${userId}, ${displayName}, ${passwordHash})`;
    if (!row) throw new Error("Team invitation acceptance did not return a user");
    return {
      userId: row.user_id,
      email: row.user_email,
      teamId: row.team_id,
      workspaceId: row.workspace_id,
    };
  }

  async acceptBrainInvitation(
    tokenHash: string,
    userId: string | null,
    displayName: string | null,
    passwordHash: string | null,
  ) {
    const [row] = await this.client.sql<
      Array<{ user_id: string; user_email: string; brain_id: string }>
    >`SELECT * FROM owl_accept_brain_invitation(${tokenHash}, ${userId}, ${displayName}, ${passwordHash})`;
    if (!row) throw new Error("Brain invitation acceptance did not return a user");
    return { userId: row.user_id, email: row.user_email, brainId: row.brain_id };
  }

  async grantBrainRole(brainId: string, userId: string, role: BrainRole): Promise<void> {
    await this.client.sql`
      INSERT INTO brain_members (brain_id, user_id, role)
      VALUES (${brainId}, ${userId}, ${role})
      ON CONFLICT (brain_id, user_id) DO UPDATE SET role = excluded.role
    `;
  }

  /**
   * Removes OAuth records past their expiry. Nothing else ever deleted them, so every access
   * token and code issued stayed in the table and each grant lookup scanned all of them.
   */
  async pruneExpiredOauthRecords(olderThanSeconds = 24 * 60 * 60): Promise<number> {
    const rows = await this.client.sql<Array<{ id: string }>>`
      DELETE FROM oauth_records
      WHERE expires_at IS NOT NULL
        AND expires_at < now() - (${olderThanSeconds} * interval '1 second')
      RETURNING id
    `;
    return rows.length;
  }

  async listConnections(userId: string) {
    const rows = await this.client.sql<any[]>`
      SELECT grants.id, grants.payload, clients.payload AS client
      FROM oauth_records grants
      LEFT JOIN oauth_records clients
        ON clients.model = 'Client' AND clients.id = grants.payload->>'clientId'
      WHERE grants.model = 'Grant' AND grants.payload->>'accountId' = ${userId}
      ORDER BY coalesce((grants.payload->>'iat')::bigint, 0) DESC
    `;
    return rows.map((row) => ({
      grantId: row.id as string,
      clientId: row.payload.clientId as string,
      clientName: row.client?.clientName ?? row.client?.client_name ?? row.payload.clientId,
      scopes: String(row.payload.openid?.scope ?? "")
        .split(" ")
        .filter(Boolean),
      resources: row.payload.resources ?? {},
    }));
  }

  async revokeConnection(userId: string, grantId: string): Promise<boolean> {
    return (await this.client.sql.begin(async (tx) => {
      const [grant] = await tx<any[]>`
        SELECT id FROM oauth_records
        WHERE model = 'Grant' AND id = ${grantId} AND payload->>'accountId' = ${userId}
        FOR UPDATE
      `;
      if (!grant) return false;
      await tx`DELETE FROM oauth_records WHERE id = ${grantId} AND model = 'Grant'`;
      await tx`DELETE FROM oauth_records WHERE payload->>'grantId' = ${grantId}`;
      return true;
    })) as boolean;
  }
}

export class OidcPostgresAdapter {
  constructor(
    private readonly model: string,
    private readonly sql: postgres.Sql,
  ) {}

  async upsert(id: string, payload: Record<string, unknown>, expiresIn: number): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const storedPayload = normalizeOidcAdapterPayload(this.model, payload);
    await this.sql`
      INSERT INTO oauth_records (model, id, payload, expires_at)
      VALUES (${this.model}, ${id}, ${JSON.stringify(storedPayload)}::jsonb, ${expiresAt})
      ON CONFLICT (model, id) DO UPDATE SET
        payload = excluded.payload, expires_at = excluded.expires_at, consumed_at = NULL
    `;
  }

  async find(id: string): Promise<Record<string, unknown> | undefined> {
    const [row] = await this.sql<any[]>`
      SELECT payload, consumed_at FROM oauth_records
      WHERE model = ${this.model} AND id = ${id}
        AND (expires_at IS NULL OR expires_at > now())
    `;
    if (!row) return undefined;
    return row.consumed_at
      ? { ...row.payload, consumed: Math.floor(new Date(row.consumed_at).getTime() / 1000) }
      : row.payload;
  }

  async findByUserCode(userCode: string) {
    return this.findByPayload("userCode", userCode);
  }

  async findByUid(uid: string) {
    return this.findByPayload("uid", uid);
  }

  async consume(id: string): Promise<void> {
    await this.sql`
      UPDATE oauth_records SET consumed_at = now() WHERE model = ${this.model} AND id = ${id}
    `;
  }

  async destroy(id: string): Promise<void> {
    await this.sql`DELETE FROM oauth_records WHERE model = ${this.model} AND id = ${id}`;
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.sql`
      DELETE FROM oauth_records WHERE model = ${this.model} AND payload->>'grantId' = ${grantId}
    `;
  }

  private async findByPayload(key: string, value: string) {
    const [row] = await this.sql<any[]>`
      SELECT id FROM oauth_records
      WHERE model = ${this.model} AND payload->>${key} = ${value}
        AND (expires_at IS NULL OR expires_at > now()) LIMIT 1
    `;
    return row ? this.find(row.id) : undefined;
  }
}

export function normalizeOidcAdapterPayload(
  model: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (model !== "RefreshToken" || typeof payload.scope !== "string") return payload;
  const scopes = payload.scope.split(/\s+/).filter(Boolean);
  if (scopes.includes("offline_access")) return payload;
  return { ...payload, scope: [...scopes, "offline_access"].join(" ") };
}

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    systemOwner: row.system_owner,
    emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at) : null,
    disabledAt: row.disabled_at ? new Date(row.disabled_at) : null,
  };
}
