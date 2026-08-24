import type { BrainRole, WorkspaceRole } from "@owl-memory/contracts";
import type postgres from "postgres";
import type { DatabaseClient } from "./client.js";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  systemOwner: boolean;
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
  ): Promise<{ user: UserRecord; workspaceId: string }> {
    return (await this.client.sql.begin(async (tx) => {
      const countRows = await tx<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM users`;
      if ((countRows[0]?.count ?? 0) > 0)
        throw new Error("The first owner has already been created");
      const [userRow] = await tx<any[]>`
        INSERT INTO users (email, display_name, password_hash, system_owner)
        VALUES (${email}, ${displayName}, ${passwordHash}, true) RETURNING *
      `;
      const [workspace] = await tx<any[]>`
        INSERT INTO workspaces (slug, name, created_by)
        VALUES ('default', 'Default workspace', ${userRow.id}) RETURNING id
      `;
      await tx`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (${workspace.id}, ${userRow.id}, 'owner')
      `;
      return { user: mapUser(userRow), workspaceId: workspace.id as string };
    })) as { user: UserRecord; workspaceId: string };
  }

  async inviteUser(
    email: string,
    displayName: string,
    passwordHash: string,
    workspaceId: string,
    workspaceRole: WorkspaceRole,
  ): Promise<UserRecord> {
    return (await this.client.sql.begin(async (tx) => {
      const [row] = await tx<any[]>`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (${email}, ${displayName}, ${passwordHash})
        ON CONFLICT ((lower(email))) DO UPDATE SET display_name = excluded.display_name
        RETURNING *
      `;
      await tx`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (${workspaceId}, ${row.id}, ${workspaceRole})
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role
      `;
      return mapUser(row);
    })) as UserRecord;
  }

  async grantBrainRole(brainId: string, userId: string, role: BrainRole): Promise<void> {
    await this.client.sql`
      INSERT INTO brain_members (brain_id, user_id, role)
      VALUES (${brainId}, ${userId}, ${role})
      ON CONFLICT (brain_id, user_id) DO UPDATE SET role = excluded.role
    `;
  }

  async acceptInvitation(tokenHash: string, displayName: string, passwordHash: string) {
    const [row] = await this.client.sql<Array<{ user_id: string; user_email: string }>>`
      SELECT * FROM owl_accept_invitation(${tokenHash}, ${displayName}, ${passwordHash})
    `;
    if (!row) throw new Error("Invitation acceptance did not return a user");
    return { userId: row.user_id, email: row.user_email };
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
    disabledAt: row.disabled_at ? new Date(row.disabled_at) : null,
  };
}
