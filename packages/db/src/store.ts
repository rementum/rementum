import {
  type BrainArticleCount,
  type BrainListSort,
  type BrainRole,
  type CreateBrainInput,
  type CreateTaskInput,
  type MaintenanceCandidate,
  type McpAnalytics,
  type McpAnalyticsRange,
  type PromoteWriteInput,
  type ReviewQueue,
  type RoutingIndexSort,
  type SearchArticlesInput,
  type SourceInput,
  type Task,
  type TeamRole,
  WEB_SESSION_CLIENT_ID,
} from "@rementum/contracts";
import {
  type Actor,
  type ArticleBundle,
  type ArticleRecord,
  type BrainRecord,
  type CipherEnvelope,
  type ClaimedCompactionJob,
  type CompactionJobRecord,
  ConflictError,
  type DataStore,
  type ExportedVersion,
  ForbiddenError,
  type GeneratedArticle,
  type McpToolCallInput,
  NotFoundError,
  type ResolvedStageWriteInput,
  reciprocalRankFusion,
  type SealedBody,
  type SearchHit,
  type StagedWriteRecord,
  type TeamInvitationRecord,
  type TeamMemberRecord,
  type TeamRecord,
  type VersionRecord,
  type VersionSummary,
  type WorkspaceRecord,
  type WrappedKey,
} from "@rementum/core";
import type postgres from "postgres";
import type { DatabaseClient } from "./client.js";

type Tx = postgres.TransactionSql;

const MCP_ANALYTICS_DAYS: Record<McpAnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

export class PostgresStore implements DataStore {
  constructor(private readonly client: DatabaseClient) {}

  async loadActor(userId: string, clientId: string | null): Promise<Actor> {
    const [row] = await this.client.sql<
      Array<{
        context: {
          teamRoles: Record<string, TeamRole>;
          workspaceRoles: Record<string, TeamRole>;
          brainRoles: Record<string, BrainRole>;
        };
      }>
    >`SELECT owl_actor_context(${userId}::uuid) AS context`;
    if (!row) throw new NotFoundError("User");
    return {
      userId,
      clientId,
      teamRoles: new Map(Object.entries(row.context.teamRoles ?? {})),
      workspaceRoles: new Map(Object.entries(row.context.workspaceRoles ?? {})),
      brainRoles: new Map(Object.entries(row.context.brainRoles ?? {})),
    };
  }

  async claimCompaction(
    workerId: string,
    leaseSeconds: number,
  ): Promise<ClaimedCompactionJob | null> {
    const [row] = await this.client.sql<any[]>`
      SELECT * FROM owl_worker_claim_compaction(${workerId}, ${leaseSeconds})
    `;
    if (!row) return null;
    return {
      jobId: row.job_id,
      workspaceId: row.workspace_id,
      brainId: row.brain_id,
      articleId: row.article_id,
      articleVersion: Number(row.article_version),
      sourceTitle: row.source_title,
      attempts: Number(row.attempts),
      ownerId: row.owner_id,
      claimId: row.claim_id,
    };
  }

  async extendCompactionLease(
    jobId: string,
    claimId: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const [row] = await this.client.sql<Array<{ extended: boolean }>>`
      SELECT owl_worker_extend_compaction_lease(${jobId}, ${claimId}, ${leaseSeconds}) AS extended
    `;
    return row?.extended === true;
  }

  async scopeActorToWorkspace(actor: Actor, workspaceId: string): Promise<Actor> {
    const workspaceRole = actor.workspaceRoles.get(workspaceId);
    if (!workspaceRole) throw new ForbiddenError();
    const scoped = await this.withActor(actor, async (tx) => {
      const [workspace] = await tx<Array<{ team_id: string }>>`
        SELECT team_id FROM workspaces WHERE id = ${workspaceId}
      `;
      if (!workspace) throw new ForbiddenError();
      const rows = await tx<Array<{ id: string }>>`
        SELECT id FROM brains WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
      `;
      return { teamId: workspace.team_id, brainIds: new Set(rows.map((row) => row.id)) };
    });
    const teamRole = actor.teamRoles.get(scoped.teamId);
    if (!teamRole) throw new ForbiddenError();
    return {
      ...actor,
      teamRoles: new Map([[scoped.teamId, teamRole]]),
      workspaceRoles: new Map([[workspaceId, workspaceRole]]),
      brainRoles: new Map(
        [...actor.brainRoles].filter(([brainId]) => scoped.brainIds.has(brainId)),
      ),
    };
  }

  async createTeam(
    name: string,
    slug: string,
    actor: Actor,
    teamId: string,
    workspaceId: string,
  ): Promise<{ team: TeamRecord; workspace: WorkspaceRecord }> {
    return this.withActor(
      actor,
      async (tx) => {
        const [team] = await tx<any[]>`
          INSERT INTO teams (id, slug, name, created_by)
          VALUES (${teamId}, ${slug}, ${name}, ${actor.userId}) RETURNING *
        `;
        await tx`
          INSERT INTO team_members (team_id, user_id, role)
          VALUES (${teamId}, ${actor.userId}, 'owner')
        `;
        const [workspace] = await tx<any[]>`
          INSERT INTO workspaces (id, team_id, slug, name, created_by)
          VALUES (${workspaceId}, ${teamId}, 'default', 'Default workspace', ${actor.userId})
          RETURNING *
        `;
        if (!team || !workspace) throw new Error("Team creation did not return its records");
        actor.teamRoles.set(teamId, "owner");
        actor.workspaceRoles.set(workspaceId, "owner");
        return {
          team: { ...mapTeam(team), role: "owner" },
          workspace: { ...mapWorkspace(workspace), role: "owner" },
        };
      },
      { ownerTeamId: teamId, workspaceId },
    );
  }

  async listTeams(actor: Actor): Promise<TeamRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT t.*, tm.role
        FROM teams t
        JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ${actor.userId}
        ORDER BY t.created_at ASC, t.name ASC
      `;
      return rows.map(mapTeam);
    });
  }

  async createWorkspace(
    teamId: string,
    name: string,
    slug: string,
    actor: Actor,
    workspaceId: string,
  ): Promise<WorkspaceRecord> {
    return this.withActor(
      actor,
      async (tx) => {
        const [row] = await tx<any[]>`
          INSERT INTO workspaces (id, team_id, slug, name, created_by)
          VALUES (${workspaceId}, ${teamId}, ${slug}, ${name}, ${actor.userId}) RETURNING *
        `;
        if (!row) throw new Error("Workspace insert did not return a row");
        const role = actor.teamRoles.get(teamId);
        if (!role) throw new ForbiddenError();
        actor.workspaceRoles.set(workspaceId, role);
        return { ...mapWorkspace(row), role };
      },
      { workspaceId },
    );
  }

  async listWorkspaces(actor: Actor, teamId?: string): Promise<WorkspaceRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT w.*, tm.role
        FROM workspaces w
        JOIN team_members tm ON tm.team_id = w.team_id AND tm.user_id = ${actor.userId}
        WHERE (${teamId ?? null}::uuid IS NULL OR w.team_id = ${teamId ?? null})
        ORDER BY w.created_at ASC, w.name ASC
      `;
      return rows.map(mapWorkspace);
    });
  }

  async getWorkspace(workspaceId: string, actor: Actor): Promise<WorkspaceRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        SELECT workspace.*, member.role
        FROM workspaces workspace
        JOIN team_members member
          ON member.team_id = workspace.team_id AND member.user_id = ${actor.userId}
        WHERE workspace.id = ${workspaceId}
      `;
      return row ? mapWorkspace(row) : null;
    });
  }

  async updateWorkspace(
    workspaceId: string,
    patch: { name?: string; slug?: string; llmCompactionEnabled?: boolean },
    actor: Actor,
  ): Promise<WorkspaceRecord> {
    return this.withActor(actor, async (tx) => {
      const [existing] = await tx<any[]>`
        SELECT * FROM workspaces WHERE id = ${workspaceId} FOR UPDATE
      `;
      if (!existing) throw new NotFoundError("Workspace");
      const [row] = await tx<any[]>`
        UPDATE workspaces SET
          name = ${patch.name ?? existing.name},
          slug = ${patch.slug ?? existing.slug},
          llm_compaction_enabled = ${patch.llmCompactionEnabled ?? existing.llm_compaction_enabled}
        WHERE id = ${workspaceId} RETURNING *
      `;
      if (!row) throw new NotFoundError("Workspace");
      const role = actor.workspaceRoles.get(workspaceId);
      if (!role) throw new ForbiddenError();
      return { ...mapWorkspace(row), role };
    });
  }

  async deleteWorkspace(
    workspaceId: string,
    confirmation: string,
    actor: Actor,
  ): Promise<WorkspaceRecord> {
    return this.withActor(actor, async (tx) => {
      const [workspace] = await tx<any[]>`SELECT * FROM workspaces WHERE id = ${workspaceId}`;
      if (!workspace) throw new NotFoundError("Workspace");
      const role = actor.teamRoles.get(workspace.team_id);
      if (!role) throw new ForbiddenError();
      if (confirmation !== workspace.name) {
        throw new ConflictError("Workspace name confirmation does not match");
      }
      await tx`SELECT id FROM teams WHERE id = ${workspace.team_id} FOR UPDATE`;
      const [count] = await tx<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM workspaces WHERE team_id = ${workspace.team_id}
      `;
      if ((count?.count ?? 0) <= 1) {
        throw new ConflictError("A team must keep at least one workspace");
      }
      const brainRows = await tx<Array<{ id: string }>>`
        SELECT id FROM brains WHERE workspace_id = ${workspaceId}
      `;
      const deleted = await tx<
        any[]
      >`DELETE FROM workspaces WHERE id = ${workspaceId} RETURNING id`;
      if (!deleted.length) throw new NotFoundError("Workspace");
      actor.workspaceRoles.delete(workspaceId);
      for (const brain of brainRows) actor.brainRoles.delete(brain.id);
      return {
        ...mapWorkspace(workspace),
        role,
      };
    });
  }

  async deleteTeam(teamId: string, confirmation: string, actor: Actor): Promise<TeamRecord> {
    return this.withActor(actor, async (tx) => {
      const [team] = await tx<any[]>`SELECT * FROM teams WHERE id = ${teamId} FOR UPDATE`;
      if (!team) throw new NotFoundError("Team");
      const role = actor.teamRoles.get(teamId);
      if (!role) throw new ForbiddenError();
      if (confirmation !== team.name) {
        throw new ConflictError("Team name confirmation does not match");
      }
      // Locking every membership row serializes concurrent deletes by the same user: two
      // transactions deleting the user's only two teams would otherwise each count the
      // other team as remaining and leave the account with none. A row another transaction
      // cascade-deletes while we wait is skipped after the lock, so the recount is honest.
      // FOR UPDATE cannot sit next to an aggregate, hence the count in code.
      const memberships = await tx<Array<{ team_id: string }>>`
        SELECT team_id FROM team_members WHERE user_id = ${actor.userId} FOR UPDATE
      `;
      const remaining = memberships.filter((row) => row.team_id !== teamId).length;
      // Registration creates exactly one team, and the whole web app assumes at least one
      // exists for the signed-in user; deleting the last one would strand the account.
      if (remaining < 1) {
        throw new ConflictError("Deleting your only team would leave the account without one");
      }
      const workspaceRows = await tx<Array<{ id: string }>>`
        SELECT id FROM workspaces WHERE team_id = ${teamId}
      `;
      const brainRows = await tx<Array<{ id: string }>>`
        SELECT b.id FROM brains b
        JOIN workspaces w ON w.id = b.workspace_id
        WHERE w.team_id = ${teamId}
      `;
      const deleted = await tx<any[]>`DELETE FROM teams WHERE id = ${teamId} RETURNING id`;
      if (!deleted.length) throw new NotFoundError("Team");
      actor.teamRoles.delete(teamId);
      for (const workspace of workspaceRows) actor.workspaceRoles.delete(workspace.id);
      for (const brain of brainRows) actor.brainRoles.delete(brain.id);
      return mapTeam({ ...team, role });
    });
  }

  async listTeamMembers(teamId: string, actor: Actor): Promise<TeamMemberRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT tm.user_id, u.email, u.display_name, tm.role, tm.created_at
        FROM team_members tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ${teamId}
        ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          lower(u.email)
      `;
      return rows.map(mapTeamMember);
    });
  }

  async updateTeamMemberRole(
    teamId: string,
    userId: string,
    role: "admin" | "member",
    actor: Actor,
  ): Promise<TeamMemberRecord> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        UPDATE team_members SET role = ${role}
        WHERE team_id = ${teamId} AND user_id = ${userId} AND role <> 'owner'
        RETURNING user_id, role, created_at
      `;
      if (!row) throw new NotFoundError("Editable team member");
      const [user] = await tx<any[]>`SELECT email, display_name FROM users WHERE id = ${userId}`;
      return mapTeamMember({ ...row, ...user });
    });
  }

  async removeTeamMember(teamId: string, userId: string, actor: Actor): Promise<void> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        DELETE FROM team_members
        WHERE team_id = ${teamId} AND user_id = ${userId} AND role <> 'owner'
        RETURNING user_id
      `;
      if (!rows.length) throw new NotFoundError("Removable team member");
      // Brains the member solely owned would be left with no owner row, which drops them
      // out of every worker pass. The team owner, who already acts as their owner, takes
      // the row over before the member's memberships go.
      await tx`
        INSERT INTO brain_members (brain_id, user_id, role)
        SELECT b.id, tm.user_id, 'owner'
        FROM brains b
        JOIN workspaces w ON w.id = b.workspace_id
        JOIN team_members tm ON tm.team_id = w.team_id AND tm.role = 'owner'
        WHERE w.team_id = ${teamId}
          AND EXISTS (
            SELECT 1 FROM brain_members owned
            WHERE owned.brain_id = b.id AND owned.user_id = ${userId} AND owned.role = 'owner'
          )
          AND NOT EXISTS (
            SELECT 1 FROM brain_members other
            WHERE other.brain_id = b.id AND other.role = 'owner'
              AND other.user_id NOT IN (${userId}, tm.user_id)
          )
        ON CONFLICT (brain_id, user_id) DO UPDATE SET role = 'owner'
      `;
      await tx`
        DELETE FROM brain_members bm
        USING brains b, workspaces w
        WHERE bm.brain_id = b.id AND b.workspace_id = w.id
          AND w.team_id = ${teamId} AND bm.user_id = ${userId}
      `;
    });
  }

  async listTeamInvitations(teamId: string, actor: Actor): Promise<TeamInvitationRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT * FROM team_invitations
        WHERE team_id = ${teamId} AND accepted_at IS NULL AND revoked_at IS NULL
          AND expires_at > now()
        ORDER BY created_at DESC
      `;
      return rows.map(mapTeamInvitation);
    });
  }

  async createTeamInvitation(
    teamId: string,
    email: string,
    role: "admin" | "member",
    tokenHash: string,
    expiresAt: Date,
    actor: Actor,
  ): Promise<TeamInvitationRecord> {
    return this.withActor(actor, async (tx) => {
      await tx`
        UPDATE team_invitations SET revoked_at = now()
        WHERE team_id = ${teamId} AND lower(email) = lower(${email})
          AND accepted_at IS NULL AND revoked_at IS NULL
      `;
      const [row] = await tx<any[]>`
        INSERT INTO team_invitations (
          team_id, email, role, token_hash, expires_at, invited_by
        ) VALUES (
          ${teamId}, ${email}, ${role}, ${tokenHash}, ${expiresAt.toISOString()}, ${actor.userId}
        ) RETURNING *
      `;
      if (!row) throw new Error("Team invitation insert did not return a row");
      return mapTeamInvitation(row);
    });
  }

  async revokeTeamInvitation(invitationId: string, actor: Actor): Promise<TeamInvitationRecord> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        UPDATE team_invitations SET revoked_at = now()
        WHERE id = ${invitationId} AND accepted_at IS NULL AND revoked_at IS NULL
        RETURNING *
      `;
      if (!row) throw new NotFoundError("Pending team invitation");
      return mapTeamInvitation(row);
    });
  }

  async createBrain(
    input: CreateBrainInput & { workspaceId: string },
    actor: Actor,
    wrappedKey: WrappedKey,
    id: string,
  ): Promise<BrainRecord> {
    return this.withActor(actor, async (tx) => {
      await setActorConfig(tx, actor, { ownerBrainId: id });
      const [row] = await tx<any[]>`
        INSERT INTO brains (
          id, workspace_id, slug, name, description, instructions, wrapped_key, created_by
        ) VALUES (
          ${id}, ${input.workspaceId}, ${input.slug}, ${input.name}, ${input.description},
          ${input.instructions}, ${JSON.stringify(wrappedKey)}::jsonb, ${actor.userId}
        ) RETURNING *
      `;
      await tx`
        INSERT INTO brain_members (brain_id, user_id, role)
        VALUES (${id}, ${actor.userId}, 'owner')
      `;
      if (!row) throw new Error("Brain insert did not return a row");
      actor.brainRoles.set(id, "owner");
      return mapBrain(row);
    });
  }

  async listBrains(
    actor: Actor,
    options: {
      workspaceId?: string;
      excludeWorkspaceIds?: string[];
      sort?: BrainListSort;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: BrainRecord[]; total: number }> {
    const { workspaceId, excludeWorkspaceIds, sort = "updated", limit, offset } = options;
    return this.withActor(actor, async (tx) => {
      // A fragment object cannot be embedded twice, so both queries rebuild the WHERE.
      const where = () => tx`
        deleted_at IS NULL
        AND (${workspaceId ?? null}::uuid IS NULL OR workspace_id = ${workspaceId ?? null})
        ${excludeWorkspaceIds ? tx`AND workspace_id <> ALL(${excludeWorkspaceIds}::uuid[])` : tx``}
      `;
      const rows = await tx<any[]>`
        SELECT * FROM brains WHERE ${where()}
        ORDER BY ${tx.unsafe(BRAIN_LIST_ORDER[sort])}
        ${limit !== undefined ? tx`LIMIT ${limit}` : tx``}
        ${offset ? tx`OFFSET ${offset}` : tx``}
      `;
      const [count] = await tx<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total FROM brains WHERE ${where()}
      `;
      return { items: rows.map(mapBrain), total: count?.total ?? 0 };
    });
  }

  async countArticlesByBrain(actor: Actor, workspaceId?: string): Promise<BrainArticleCount[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<
        Array<{ brain_id: string; article_count: number; latest_article_updated_at: Date | string }>
      >`
        SELECT brain_id, COUNT(*)::int AS article_count,
          MAX(updated_at) AS latest_article_updated_at
        FROM articles WHERE archived_at IS NULL
        ${
          workspaceId
            ? tx`AND EXISTS (
                SELECT 1 FROM brains
                WHERE brains.id = articles.brain_id AND brains.workspace_id = ${workspaceId}
              )`
            : tx``
        }
        GROUP BY brain_id
      `;
      return rows.map((row) => ({
        brainId: row.brain_id,
        articleCount: row.article_count,
        latestArticleUpdatedAt: asDate(row.latest_article_updated_at).toISOString(),
      }));
    });
  }

  async countArticles(brainId: string, actor: Actor): Promise<number> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total FROM articles
        WHERE brain_id = ${brainId} AND archived_at IS NULL
      `;
      return row?.total ?? 0;
    });
  }

  async getBrain(id: string, actor: Actor): Promise<BrainRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        SELECT * FROM brains WHERE id = ${id} AND deleted_at IS NULL
      `;
      return row ? mapBrain(row) : null;
    });
  }

  async deleteBrain(brainId: string, confirmation: string, actor: Actor): Promise<BrainRecord> {
    return this.withActor(actor, async (tx) => {
      const [brain] = await tx<any[]>`
        SELECT * FROM brains WHERE id = ${brainId} AND deleted_at IS NULL
      `;
      if (!brain) throw new NotFoundError("Brain");
      if (confirmation !== brain.name) {
        throw new ConflictError("Brain name confirmation does not match");
      }
      const deleted = await tx<any[]>`DELETE FROM brains WHERE id = ${brainId} RETURNING id`;
      if (!deleted.length) throw new NotFoundError("Brain");
      actor.brainRoles.delete(brainId);
      return mapBrain(brain);
    });
  }

  async isBrainCompactionEnabled(brainId: string, actor: Actor): Promise<boolean> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<Array<{ enabled: boolean }>>`
        SELECT owl_brain_compaction_enabled(${brainId}) AS enabled
      `;
      return row?.enabled ?? false;
    });
  }

  async listRoutingIndex(
    brainId: string,
    actor: Actor,
    limit: number,
    sort: RoutingIndexSort,
    offset = 0,
  ): Promise<ArticleRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT ${tx.unsafe(ARTICLE_COLUMNS)} FROM articles
        WHERE brain_id = ${brainId} AND archived_at IS NULL
        ORDER BY ${tx.unsafe(ROUTING_INDEX_ORDER[sort])} LIMIT ${limit} OFFSET ${offset}
      `;
      return rows.map(mapArticle);
    });
  }

  async getArticle(id: string, actor: Actor): Promise<ArticleRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<
        any[]
      >`SELECT * FROM articles WHERE id = ${id} AND archived_at IS NULL`;
      return row ? mapArticle(row) : null;
    });
  }

  async getArticleBySlug(
    brainId: string,
    slug: string,
    actor: Actor,
  ): Promise<ArticleRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        SELECT * FROM articles
        WHERE brain_id = ${brainId} AND slug = ${slug} AND archived_at IS NULL
      `;
      return row ? mapArticle(row) : null;
    });
  }

  async getVersion(
    articleId: string,
    version: number,
    actor: Actor,
  ): Promise<VersionRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        SELECT * FROM article_versions WHERE article_id = ${articleId} AND version = ${version}
      `;
      return row ? mapVersion(row) : null;
    });
  }

  async getCurrentVersion(articleId: string, actor: Actor): Promise<VersionRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        SELECT av.* FROM article_versions av
        JOIN articles a ON a.id = av.article_id AND a.current_version = av.version
        WHERE av.article_id = ${articleId} AND a.archived_at IS NULL
      `;
      return row ? mapVersion(row) : null;
    });
  }

  /**
   * Reads every current article body in one query, for the export.
   *
   * The export used to read articles one at a time through the service, which cost seven
   * transactions each. A brain is a bounded set of current versions, so one join answers
   * the whole thing.
   */
  async listCurrentVersions(
    brainId: string,
    actor: Actor,
    limit: number,
  ): Promise<ExportedVersion[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT a.id, a.slug, a.title, a.summary, a.kind, a.current_version,
               av.body_ciphertext, av.body_nonce, av.body_tag, av.cipher_version, av.body_aad
        FROM articles a
        JOIN article_versions av
          ON av.article_id = a.id AND av.version = a.current_version
        WHERE a.brain_id = ${brainId} AND a.archived_at IS NULL
        ORDER BY a.slug
        LIMIT ${limit}
      `;
      return rows.map((row) => ({
        articleId: row.id as string,
        slug: row.slug as string,
        title: row.title as string,
        summary: row.summary as string,
        kind: row.kind as string,
        version: Number(row.current_version),
        body: envelopeFromRow(row),
        bodyAad: row.body_aad as string,
      }));
    });
  }

  // History never decrypts, so the ciphertext of every version stays in the database
  // instead of crossing to the API only to be stripped before the response.
  async listArticleVersions(articleId: string, actor: Actor): Promise<VersionSummary[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT id, brain_id, article_id, version, body_hash, change_summary, sources, actor_id,
               client_id, created_at
        FROM article_versions WHERE article_id = ${articleId} ORDER BY version DESC
      `;
      return rows.map((row) => {
        const {
          body: _body,
          bodyAad: _bodyAad,
          ...summary
        } = mapVersion({
          ...row,
          body_ciphertext: Buffer.alloc(0),
          body_nonce: Buffer.alloc(0),
          body_tag: Buffer.alloc(0),
          cipher_version: 1,
          body_aad: "",
        });
        return summary;
      });
    });
  }

  async getArticleLinks(
    articleId: string,
    actor: Actor,
  ): Promise<Array<{ articleId: string; slug: string; relation: string }>> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<Array<{ article_id: string; slug: string; relation: string }>>`
        SELECT target.id AS article_id, target.slug, links.relation
        FROM article_links links
        JOIN articles target ON target.id = links.to_article_id
        WHERE links.from_article_id = ${articleId} AND target.archived_at IS NULL
        ORDER BY target.slug
      `;
      return rows.map((row) => ({
        articleId: row.article_id,
        slug: row.slug,
        relation: row.relation,
      }));
    });
  }

  async getArticleSources(articleId: string, version: number, actor: Actor) {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT s.* FROM article_sources ars
        JOIN sources s ON s.id = ars.source_id
        WHERE ars.article_id = ${articleId} AND ars.version = ${version}
        ORDER BY s.created_at
      `;
      return rows.map((row) => ({
        id: row.id as string,
        kind: row.kind,
        locator: row.locator ?? undefined,
        checksum: row.checksum ?? undefined,
        label: row.label ?? undefined,
        metadata: row.metadata ?? {},
      }));
    });
  }

  /**
   * Reads everything one article view needs, inside a single transaction.
   *
   * readArticle used to make six scoped calls plus an audit write, and each opened its
   * own transaction: seven connections and seven RLS setups for one logical read. The
   * queries are unchanged, they just share the context they all needed anyway.
   *
   * Returns null when the article is not visible. An article whose brain or current
   * version is missing is a different failure, and still reports itself as one: that
   * combination means the rows disagree, not that the caller asked for nothing.
   */
  async readArticleBundle(articleId: string, actor: Actor): Promise<ArticleBundle | null> {
    return this.withActor(actor, async (tx) => {
      const [articleRow] = await tx<any[]>`
        SELECT * FROM articles WHERE id = ${articleId} AND archived_at IS NULL
      `;
      if (!articleRow) return null;
      const article = mapArticle(articleRow);
      const [brainRow] = await tx<any[]>`
        SELECT * FROM brains WHERE id = ${article.brainId} AND deleted_at IS NULL
      `;
      if (!brainRow) throw new NotFoundError("Article version");
      const [versionRow] = await tx<any[]>`
        SELECT av.* FROM article_versions av
        JOIN articles a ON a.id = av.article_id AND a.current_version = av.version
        WHERE av.article_id = ${articleId} AND a.archived_at IS NULL
      `;
      if (!versionRow) throw new NotFoundError("Article version");
      const version = mapVersion(versionRow);
      const linkRows = await tx<Array<{ article_id: string; slug: string; relation: string }>>`
        SELECT target.id AS article_id, target.slug, links.relation
        FROM article_links links
        JOIN articles target ON target.id = links.to_article_id
        WHERE links.from_article_id = ${articleId} AND target.archived_at IS NULL
        ORDER BY target.slug
      `;
      const sourceRows = await tx<any[]>`
        SELECT s.* FROM article_sources ars
        JOIN sources s ON s.id = ars.source_id
        WHERE ars.article_id = ${articleId} AND ars.version = ${version.version}
        ORDER BY s.created_at
      `;
      const [enabled] = await tx<Array<{ enabled: boolean }>>`
        SELECT owl_brain_compaction_enabled(${article.brainId}) AS enabled
      `;
      return {
        article,
        brain: mapBrain(brainRow),
        version,
        links: linkRows.map((row) => ({
          articleId: row.article_id,
          slug: row.slug,
          relation: row.relation,
        })),
        sources: sourceRows.map((row) => ({
          id: row.id as string,
          kind: row.kind,
          locator: row.locator ?? undefined,
          checksum: row.checksum ?? undefined,
          label: row.label ?? undefined,
          metadata: row.metadata ?? {},
        })),
        compactionEnabled: enabled?.enabled ?? false,
      };
    });
  }

  async verifyArticle(
    articleId: string,
    reviewAfter: Date | null,
    actor: Actor,
  ): Promise<ArticleRecord> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        UPDATE articles SET verified_at = now(), review_after = ${reviewAfter?.toISOString() ?? null},
          freshness = 'current', updated_at = now()
        WHERE id = ${articleId} RETURNING *
      `;
      if (!row) throw new NotFoundError("Article");
      return mapArticle(row);
    });
  }

  async setArticleLinks(
    articleId: string,
    links: Array<{ toArticleId: string; relation: string }>,
    actor: Actor,
  ): Promise<void> {
    await this.withActor(actor, async (tx) => {
      const [article] = await tx<any[]>`SELECT brain_id FROM articles WHERE id = ${articleId}`;
      if (!article) throw new NotFoundError("Article");
      await tx`DELETE FROM article_links WHERE from_article_id = ${articleId}`;
      if (links.length === 0) return;
      // Validating and inserting one link at a time cost two round trips each. Both
      // halves answer the same question for the whole set, so both are set operations.
      const targets = [...new Set(links.map((link) => link.toArticleId))];
      const found = await tx<Array<{ id: string }>>`
        SELECT id FROM articles WHERE id = ANY(${targets}::uuid[]) AND brain_id = ${article.brain_id}
      `;
      if (found.length !== targets.length) {
        throw new ConflictError("Article links must remain inside one brain");
      }
      // The table holds a set keyed by (from, to, relation) but the input is a list, so
      // the same pair twice used to fail the whole call on the primary key. Naming the
      // links an article has is idempotent; asking for one twice is not an error.
      const values = [
        ...new Map(
          links.map((link) => [
            `${link.toArticleId}:${link.relation}`,
            {
              from_article_id: articleId,
              to_article_id: link.toArticleId,
              relation: link.relation,
              created_by: actor.userId,
            },
          ]),
        ).values(),
      ];
      await tx`
        INSERT INTO article_links ${tx(values, "from_article_id", "to_article_id", "relation", "created_by")}
      `;
    });
  }

  async createStagedWrite(
    input: ResolvedStageWriteInput,
    actor: Actor,
    targetArticleId: string,
    writeId: string,
    encrypted: CipherEnvelope,
    bodyAad: string,
    bodyHash: string,
    potentialConflicts: StagedWriteRecord["potentialConflicts"],
  ): Promise<StagedWriteRecord> {
    return this.withActor(actor, async (tx) => {
      // Two concurrent stagings with one key both pass a check-then-insert; the unique
      // index then fails the loser. Let the index decide and read the winner back instead.
      const [row] = await tx<any[]>`
        INSERT INTO staged_writes (
          id, brain_id, article_id, operation, slug, title, summary, keywords, kind,
          base_version, body_ciphertext, body_nonce, body_tag, cipher_version, body_aad,
          body_hash, change_summary, sources, potential_conflicts, acknowledged_conflicts,
          staged_by, staged_client_id, idempotency_key
        ) VALUES (
          ${writeId}, ${input.brainId}, ${targetArticleId}, ${input.operation}, ${input.slug},
          ${input.title}, ${input.summary}, ${input.keywords}, ${input.kind},
          ${input.baseVersion ?? null}, ${decode(encrypted.ciphertext)}, ${decode(encrypted.nonce)},
          ${decode(encrypted.tag)}, ${encrypted.version}, ${bodyAad}, ${bodyHash},
          ${input.changeSummary}, ${JSON.stringify(input.sources)}::jsonb,
          ${JSON.stringify(potentialConflicts)}::jsonb,
          ${input.acknowledgePotentialConflicts}, ${actor.userId}, ${actor.clientId},
          ${input.idempotencyKey ?? null}
        )
        ON CONFLICT (staged_by, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING *
      `;
      if (row) return mapWrite(row);
      const [existing] = await tx<any[]>`
        SELECT * FROM staged_writes
        WHERE staged_by = ${actor.userId} AND idempotency_key = ${input.idempotencyKey ?? null}
      `;
      if (!existing) throw new Error("Staged write insert did not return a row");
      return mapWrite(existing);
    });
  }

  async getStagedWriteByIdempotencyKey(
    idempotencyKey: string,
    actor: Actor,
  ): Promise<StagedWriteRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        SELECT * FROM staged_writes
        WHERE staged_by = ${actor.userId} AND idempotency_key = ${idempotencyKey}
      `;
      return row ? mapWrite(row) : null;
    });
  }

  async getStagedWrite(id: string, actor: Actor): Promise<StagedWriteRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`SELECT * FROM staged_writes WHERE id = ${id}`;
      return row ? mapWrite(row) : null;
    });
  }

  async listStagedWrites(
    brainId: string,
    actor: Actor,
    status?: StagedWriteRecord["status"],
  ): Promise<StagedWriteRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT * FROM staged_writes
        WHERE brain_id = ${brainId} ${status ? tx`AND status = ${status}` : tx``}
        ORDER BY created_at DESC LIMIT 500
      `;
      return rows.map(mapWrite);
    });
  }

  /**
   * Writes awaiting review across every readable brain in a workspace, plus per-brain
   * counts. The dashboard used to list every brain's writes one request at a time and
   * count them in the browser, which was a request per brain on every page view.
   */
  async listWorkspaceReviewQueue(
    workspaceId: string,
    actor: Actor,
    limit: number,
  ): Promise<ReviewQueue> {
    return this.withActor(actor, async (tx) => {
      const items = await tx<any[]>`
        SELECT w.id, w.brain_id, b.name AS brain_name, w.operation, w.slug, w.title, w.status,
               w.change_summary, w.created_at
        FROM staged_writes w
        JOIN brains b ON b.id = w.brain_id
        WHERE b.workspace_id = ${workspaceId} AND b.deleted_at IS NULL
          AND w.status IN ('pending', 'conflicted')
        ORDER BY (w.status = 'conflicted') DESC, w.created_at DESC
        LIMIT ${limit}
      `;
      const counts = await tx<any[]>`
        SELECT w.brain_id,
               count(*) FILTER (WHERE w.status = 'pending')::int AS pending,
               count(*) FILTER (WHERE w.status = 'conflicted')::int AS conflicted
        FROM staged_writes w
        JOIN brains b ON b.id = w.brain_id
        WHERE b.workspace_id = ${workspaceId} AND b.deleted_at IS NULL
          AND w.status IN ('pending', 'conflicted')
        GROUP BY w.brain_id
      `;
      return {
        items: items.map((row) => ({
          id: row.id,
          brainId: row.brain_id,
          brainName: row.brain_name,
          operation: row.operation,
          slug: row.slug,
          title: row.title,
          status: row.status,
          changeSummary: row.change_summary,
          createdAt: asDate(row.created_at).toISOString(),
        })),
        counts: counts.map((row) => ({
          brainId: row.brain_id,
          pending: Number(row.pending),
          conflicted: Number(row.conflicted),
        })),
      };
    });
  }

  async withdrawStagedWrite(id: string, actor: Actor): Promise<StagedWriteRecord> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        UPDATE staged_writes SET status = 'withdrawn', updated_at = now()
        WHERE id = ${id} AND status IN ('pending', 'conflicted') RETURNING *
      `;
      if (!row) throw new ConflictError("Only pending or conflicted writes can be withdrawn");
      return mapWrite(row);
    });
  }

  async promoteStagedWrite(
    input: PromoteWriteInput,
    actor: Actor,
    llmAvailable: boolean,
    sealVersion: (write: StagedWriteRecord, version: number) => SealedBody,
  ): Promise<{ write: StagedWriteRecord; article: ArticleRecord; version: VersionRecord }> {
    const outcome = await this.withActor(actor, async (tx) => {
      const [rawWrite] = await tx<any[]>`
        SELECT * FROM staged_writes WHERE id = ${input.writeId} FOR UPDATE
      `;
      if (!rawWrite) throw new NotFoundError("Staged write");
      const write = mapWrite(rawWrite);
      if (write.status === "promoted") {
        const [articleRow] = await tx<any[]>`SELECT * FROM articles WHERE id = ${write.articleId}`;
        const [versionRow] = await tx<any[]>`
          SELECT * FROM article_versions
          WHERE article_id = ${write.articleId} AND version = ${write.promotedVersion}
        `;
        if (!articleRow || !versionRow)
          throw new Error("Promoted write is internally inconsistent");
        return {
          kind: "success" as const,
          write,
          article: mapArticle(articleRow),
          version: mapVersion(versionRow),
        };
      }
      if (write.status === "withdrawn")
        throw new ConflictError("Withdrawn writes cannot be promoted");
      if (write.status === "conflicted" && input.decision !== "override") {
        throw new ConflictError("Conflicted writes must be rebased or overridden");
      }

      const [workspace] = await tx<Array<{ id: string; llm_compaction_enabled: boolean }>>`
        SELECT workspace.id, workspace.llm_compaction_enabled
        FROM brains brain
        JOIN workspaces workspace ON workspace.id = brain.workspace_id
        WHERE brain.id = ${write.brainId}
      `;
      if (!workspace) throw new NotFoundError("Workspace");
      const queueCompaction = workspace.llm_compaction_enabled && llmAvailable;
      const compactionStatus = queueCompaction
        ? "queued"
        : workspace.llm_compaction_enabled
          ? "failed"
          : "not_requested";
      const compactionError =
        workspace.llm_compaction_enabled && !llmAvailable
          ? "The configured LLM provider is unavailable"
          : null;

      let version = 1;
      if (write.operation === "create") {
        const [duplicate] = await tx<any[]>`
          SELECT id, current_version FROM articles
          WHERE brain_id = ${write.brainId} AND slug = ${write.slug} FOR UPDATE
        `;
        // A second article cannot take the slug, so neither a rebase nor an override can
        // clear this. The write stays pending and the caller re-stages it as an update.
        if (duplicate) {
          return {
            kind: "slug_taken" as const,
            articleId: duplicate.id as string,
            currentVersion: duplicate.current_version as number,
          };
        }
        await tx`
          INSERT INTO articles (
            id, brain_id, slug, title, summary, keywords, kind, freshness, current_version, created_by,
            compaction_status, compaction_attempts, compaction_error, compacted_at
          ) VALUES (
            ${write.articleId}, ${write.brainId}, ${write.slug}, ${write.title}, ${write.summary},
            ${write.keywords}, ${write.kind}, 'unknown', 1, ${write.stagedBy},
            ${compactionStatus}, 0, ${compactionError}, NULL
          )
        `;
      } else {
        const [article] = await tx<any[]>`
          SELECT * FROM articles
          WHERE id = ${write.articleId} AND brain_id = ${write.brainId} FOR UPDATE
        `;
        if (!article) throw new NotFoundError("Article");
        if (article.current_version !== write.baseVersion && input.decision !== "override") {
          await tx`UPDATE staged_writes SET status = 'conflicted', updated_at = now() WHERE id = ${write.id}`;
          return { kind: "conflict" as const, currentVersion: article.current_version as number };
        }
        version = Number(article.current_version) + 1;
        const [taken] = await tx<any[]>`
          SELECT id, current_version FROM articles
          WHERE brain_id = ${write.brainId} AND slug = ${write.slug} AND id <> ${write.articleId}
        `;
        if (taken) {
          return {
            kind: "slug_taken" as const,
            articleId: taken.id as string,
            currentVersion: taken.current_version as number,
          };
        }
        await tx`
          UPDATE articles SET
            slug = ${write.slug}, title = ${write.title}, summary = ${write.summary},
            keywords = ${write.keywords}, kind = ${write.kind}, current_version = ${version},
            freshness = 'current', compaction_status = ${compactionStatus},
            compaction_attempts = 0, compaction_error = ${compactionError}, compacted_at = NULL,
            updated_at = now()
          WHERE id = ${write.articleId}
        `;
      }

      const sealed = sealVersion(write, version);
      const [versionRow] = await tx<any[]>`
        INSERT INTO article_versions (
          brain_id, article_id, version, body_ciphertext, body_nonce, body_tag, cipher_version,
          body_aad, body_hash, change_summary, sources, actor_id, client_id
        ) VALUES (
          ${write.brainId}, ${write.articleId}, ${version}, ${decode(sealed.body.ciphertext)},
          ${decode(sealed.body.nonce)}, ${decode(sealed.body.tag)}, ${sealed.body.version},
          ${sealed.bodyAad}, ${write.bodyHash}, ${write.changeSummary},
          ${JSON.stringify(write.sources)}::jsonb,
          ${actor.userId}, ${actor.clientId}
        ) RETURNING *
      `;
      if (queueCompaction) {
        await tx`
          INSERT INTO article_compaction_jobs (
            workspace_id, brain_id, article_id, article_version, source_title
          ) VALUES (
            ${workspace.id}, ${write.brainId}, ${write.articleId}, ${version}, ${write.title}
          )
          ON CONFLICT (article_id, article_version) DO NOTHING
        `;
      }
      await this.persistSources(tx, write, version, actor);
      const [promotedRow] = await tx<any[]>`
        UPDATE staged_writes SET
          status = 'promoted', promoted_by = ${actor.userId}, promoted_version = ${version},
          decision_summary = ${input.decisionSummary}, updated_at = now()
        WHERE id = ${write.id} RETURNING *
      `;
      const [articleRow] = await tx<any[]>`SELECT * FROM articles WHERE id = ${write.articleId}`;
      if (!versionRow || !promotedRow || !articleRow)
        throw new Error("Promotion did not return rows");
      return {
        kind: "success" as const,
        write: mapWrite(promotedRow),
        article: mapArticle(articleRow),
        version: mapVersion(versionRow),
      };
    });

    if (outcome.kind === "conflict") {
      throw new ConflictError("The article changed after this write was staged", {
        currentVersion: outcome.currentVersion,
      });
    }
    if (outcome.kind === "slug_taken") {
      throw new ConflictError(
        "Another article in this brain already uses this slug; stage an update against it",
        { articleId: outcome.articleId, currentVersion: outcome.currentVersion },
      );
    }
    return outcome;
  }

  async queueWorkspaceCurrentCompactions(workspaceId: string, actor: Actor): Promise<number> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<Array<{ id: string }>>`
        WITH queued AS (
          INSERT INTO article_compaction_jobs (
            workspace_id, brain_id, article_id, article_version, source_title
          )
          SELECT workspace.id, article.brain_id, article.id, article.current_version, article.title
          FROM articles article
          JOIN brains brain ON brain.id = article.brain_id
          JOIN workspaces workspace ON workspace.id = brain.workspace_id
          WHERE workspace.id = ${workspaceId}
            AND workspace.llm_compaction_enabled
            AND article.archived_at IS NULL
            AND article.compaction_status IN ('not_requested', 'failed')
          ON CONFLICT (article_id, article_version) DO UPDATE SET
            status = 'queued', attempts = 0, available_at = now(), claimed_by = NULL,
            lease_expires_at = NULL, last_error = NULL, source_title = excluded.source_title,
            updated_at = now()
          WHERE article_compaction_jobs.status = 'failed'
          RETURNING article_id
        )
        UPDATE articles article SET
          compaction_status = 'queued', compaction_attempts = 0,
          compaction_error = NULL, compacted_at = NULL, updated_at = now()
        FROM queued
        WHERE article.id = queued.article_id
        RETURNING article.id
      `;
      return rows.length;
    });
  }

  async queueArticleCompaction(articleId: string, actor: Actor): Promise<ArticleRecord> {
    return this.withActor(actor, async (tx) => {
      const [article] = await tx<any[]>`
        SELECT article.*, brain.workspace_id,
          owl_brain_compaction_enabled(article.brain_id) AS llm_compaction_enabled
        FROM articles article
        JOIN brains brain ON brain.id = article.brain_id
        WHERE article.id = ${articleId} AND article.archived_at IS NULL
        FOR UPDATE OF article
      `;
      if (!article) throw new NotFoundError("Article");
      if (!article.llm_compaction_enabled) {
        throw new ConflictError("LLM compaction is disabled for this workspace");
      }
      await tx`
        INSERT INTO article_compaction_jobs (
          workspace_id, brain_id, article_id, article_version, source_title
        ) VALUES (
          ${article.workspace_id}, ${article.brain_id}, ${article.id},
          ${article.current_version}, ${article.title}
        )
        ON CONFLICT (article_id, article_version) DO UPDATE SET
          status = 'queued', attempts = 0, available_at = now(), claimed_by = NULL,
          lease_expires_at = NULL, last_error = NULL, source_title = excluded.source_title,
          updated_at = now()
        WHERE article_compaction_jobs.status = 'failed'
      `;
      const [updated] = await tx<any[]>`
        UPDATE articles SET
          compaction_status = CASE
            WHEN compaction_status IN ('queued', 'processing') THEN compaction_status
            ELSE 'queued'::compaction_status
          END,
          compaction_attempts = CASE
            WHEN compaction_status IN ('queued', 'processing') THEN compaction_attempts
            ELSE 0
          END,
          compaction_error = CASE
            WHEN compaction_status IN ('queued', 'processing') THEN compaction_error
            ELSE NULL
          END,
          compacted_at = CASE
            WHEN compaction_status IN ('queued', 'processing') THEN compacted_at
            ELSE NULL
          END,
          updated_at = now()
        WHERE id = ${articleId} RETURNING *
      `;
      if (!updated) throw new NotFoundError("Article");
      return mapArticle(updated);
    });
  }

  async cancelWorkspaceCompactions(workspaceId: string, actor: Actor): Promise<string[]> {
    return this.withActor(actor, async (tx) => {
      await tx`DELETE FROM article_compaction_jobs WHERE workspace_id = ${workspaceId}`;
      const rows = await tx<Array<{ id: string }>>`
        UPDATE articles article SET
          compaction_status = 'not_requested', compaction_attempts = 0,
          compaction_error = NULL, compacted_at = NULL, updated_at = now()
        FROM brains brain
        WHERE article.brain_id = brain.id
          AND brain.workspace_id = ${workspaceId}
          AND article.compaction_status IN ('queued', 'processing')
        RETURNING article.id
      `;
      return rows.map((row) => row.id);
    });
  }

  async getCompactionJob(jobId: string, actor: Actor): Promise<CompactionJobRecord | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`SELECT * FROM article_compaction_jobs WHERE id = ${jobId}`;
      return row ? mapCompactionJob(row) : null;
    });
  }

  async completeCompaction(
    jobId: string,
    claimId: string,
    generated: GeneratedArticle,
    encrypted: CipherEnvelope,
    bodyHash: string,
    actor: Actor,
  ): Promise<{ current: boolean; articleId: string; version: number } | null> {
    return this.withActor(actor, async (tx) => {
      const [job] = await tx<any[]>`
        SELECT job.*, workspace.llm_compaction_enabled
        FROM article_compaction_jobs job
        JOIN workspaces workspace ON workspace.id = job.workspace_id
        WHERE job.id = ${jobId} AND job.status = 'processing' AND job.claimed_by = ${claimId}
        FOR UPDATE OF job
      `;
      if (!job) return null;
      if (!job.llm_compaction_enabled) {
        await tx`DELETE FROM article_compaction_jobs WHERE id = ${jobId}`;
        return null;
      }
      await tx`
        UPDATE article_versions SET
          body_ciphertext = ${decode(encrypted.ciphertext)},
          body_nonce = ${decode(encrypted.nonce)},
          body_tag = ${decode(encrypted.tag)},
          cipher_version = ${encrypted.version},
          body_hash = ${bodyHash}
        WHERE article_id = ${job.article_id} AND version = ${job.article_version}
      `;
      const [article] = await tx<any[]>`
        SELECT * FROM articles WHERE id = ${job.article_id} FOR UPDATE
      `;
      if (!article) throw new NotFoundError("Article");
      const current = Number(article.current_version) === Number(job.article_version);
      if (current) {
        await tx`
          UPDATE articles SET
            title = ${generated.title}, summary = ${generated.summary},
            compaction_status = 'compacted', compaction_attempts = ${job.attempts},
            compaction_error = NULL, compacted_at = now(), updated_at = now()
          WHERE id = ${job.article_id}
        `;
      }
      await tx`DELETE FROM article_compaction_jobs WHERE id = ${jobId}`;
      return {
        current,
        articleId: job.article_id as string,
        version: Number(job.article_version),
      };
    });
  }

  async failCompaction(
    jobId: string,
    claimId: string,
    error: string,
    retryAt: Date | null,
    actor: Actor,
  ): Promise<{ current: boolean; terminal: boolean; articleId: string; version: number } | null> {
    return this.withActor(actor, async (tx) => {
      const [job] = await tx<any[]>`
        SELECT * FROM article_compaction_jobs
        WHERE id = ${jobId} AND status = 'processing' AND claimed_by = ${claimId}
        FOR UPDATE
      `;
      if (!job) return null;
      const terminal = retryAt === null;
      await tx`
        UPDATE article_compaction_jobs SET
          status = ${terminal ? "failed" : "queued"},
          available_at = ${retryAt?.toISOString() ?? new Date().toISOString()},
          claimed_by = NULL, lease_expires_at = NULL, last_error = ${error}, updated_at = now()
        WHERE id = ${jobId}
      `;
      const [article] = await tx<any[]>`SELECT * FROM articles WHERE id = ${job.article_id}`;
      if (!article) throw new NotFoundError("Article");
      const current = Number(article.current_version) === Number(job.article_version);
      if (current) {
        await tx`
          UPDATE articles SET
            compaction_status = ${terminal ? "failed" : "queued"},
            compaction_attempts = ${job.attempts}, compaction_error = ${error},
            updated_at = now()
          WHERE id = ${job.article_id}
        `;
      }
      return {
        current,
        terminal,
        articleId: job.article_id as string,
        version: Number(job.article_version),
      };
    });
  }

  async findPotentialConflicts(
    brainId: string,
    articleId: string | undefined,
    title: string,
    summary: string,
    actor: Actor,
  ): Promise<StagedWriteRecord["potentialConflicts"]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<Array<{ id: string; slug: string; score: number }>>`
        SELECT id, slug,
          greatest(similarity(title, ${title}), similarity(summary, ${summary}))::float8 AS score
        FROM articles
        WHERE brain_id = ${brainId} AND archived_at IS NULL
          AND (${articleId ?? null}::uuid IS NULL OR id <> ${articleId ?? null}::uuid)
          AND greatest(similarity(title, ${title}), similarity(summary, ${summary})) >= 0.72
        ORDER BY score DESC LIMIT 8
      `;
      return rows.map((row) => ({ articleId: row.id, slug: row.slug, score: Number(row.score) }));
    });
  }

  async search(
    input: SearchArticlesInput,
    actor: Actor,
    embedding: { model: string; vector: number[] } | null,
  ): Promise<SearchHit[]> {
    return this.withActor(actor, async (tx) => {
      const fts = await tx<any[]>`
        SELECT ${tx.unsafe(ARTICLE_COLUMNS_A)},
               ts_rank_cd(a.search_document, websearch_to_tsquery('simple', ${input.query})) AS rank
        FROM articles a
        WHERE a.brain_id = ${input.brainId} AND a.archived_at IS NULL
          AND a.search_document @@ websearch_to_tsquery('simple', ${input.query})
          ${input.freshness?.length ? tx`AND a.freshness = ANY(${input.freshness})` : tx``}
        ORDER BY rank DESC LIMIT 50
      `;
      // Cosine distance across vectors from different models is noise, so rows from a
      // previous embedding model are excluded rather than ranked. The best chunk per article
      // is picked in the inner query; the outer one orders those by distance. DISTINCT ON
      // forces its own ordering, so a LIMIT applied to it would keep the first fifty
      // articles by id rather than the fifty nearest.
      const vectorRows = embedding
        ? await tx<any[]>`
            SELECT ${tx.unsafe(ARTICLE_COLUMNS_A)}, best.rank
            FROM (
              SELECT DISTINCT ON (ae.article_id) ae.article_id,
                     (1 - (ae.embedding <=> ${vectorLiteral(embedding.vector)}::vector))::float8 AS rank
              FROM article_embeddings ae
              JOIN articles a ON a.id = ae.article_id AND a.current_version = ae.version
              WHERE a.brain_id = ${input.brainId} AND a.archived_at IS NULL
                AND ae.model = ${embedding.model}
                ${input.freshness?.length ? tx`AND a.freshness = ANY(${input.freshness})` : tx``}
              ORDER BY ae.article_id, ae.embedding <=> ${vectorLiteral(embedding.vector)}::vector
            ) best
            JOIN articles a ON a.id = best.article_id
            ORDER BY best.rank DESC
            LIMIT 50
          `
        : [];
      const fused = reciprocalRankFusion(
        [
          fts.map((row) => ({
            item: mapArticle(row),
            score: Number(row.rank),
            source: "fts" as const,
          })),
          vectorRows
            .sort((a, b) => Number(b.rank) - Number(a.rank))
            .map((row) => ({
              item: mapArticle(row),
              score: Number(row.rank),
              source: "vector" as const,
            })),
        ],
        (article) => article.id,
      );
      return fused.slice(0, input.limit).map((entry) => ({
        article: toArticleSummary(entry.item),
        score: entry.score,
        sources: entry.sources,
        excerpt: entry.item.summary,
      }));
    });
  }

  async setEmbedding(
    articleId: string,
    version: number,
    ordinal: number,
    vector: number[],
    model: string,
    actor: Actor,
  ): Promise<void> {
    if (vector.length !== 384)
      throw new Error(`Expected 384 dimensions, received ${vector.length}`);
    await this.withActor(actor, async (tx) => {
      await tx`
        INSERT INTO article_embeddings (article_id, version, ordinal, embedding, model)
        VALUES (${articleId}, ${version}, ${ordinal}, ${vectorLiteral(vector)}::vector, ${model})
        ON CONFLICT (article_id, version, ordinal) DO UPDATE SET
          embedding = excluded.embedding, model = excluded.model, created_at = now()
      `;
    });
  }

  async clearEmbeddings(articleId: string, version: number, actor: Actor): Promise<void> {
    await this.withActor(actor, async (tx) => {
      await tx`
        DELETE FROM article_embeddings
        WHERE article_id = ${articleId} AND version = ${version}
      `;
    });
  }

  async createTask(input: CreateTaskInput, actor: Actor): Promise<Task> {
    return this.withActor(actor, async (tx) => {
      const articleIds = [...new Set(input.articleIds)];
      if (articleIds.length > 0) {
        // linkTaskArticle proves the article shares the task's brain; the same rule applies
        // to the articles named at creation, or a task could point at another brain.
        const [found] = await tx<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM articles
          WHERE id = ANY(${articleIds}::uuid[]) AND brain_id = ${input.brainId}
        `;
        if ((found?.count ?? 0) !== articleIds.length) {
          throw new ConflictError("Task articles must belong to the task's brain");
        }
      }
      const [inserted] = await tx<any[]>`
        INSERT INTO tasks (brain_id, title, brief, priority, created_by, idempotency_key)
        VALUES (${input.brainId}, ${input.title}, ${input.brief}, ${input.priority}, ${actor.userId}, ${input.idempotencyKey ?? null})
        ON CONFLICT (created_by, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING *
      `;
      if (!inserted) {
        const [existing] = await tx<any[]>`
          SELECT * FROM tasks
          WHERE created_by = ${actor.userId} AND idempotency_key = ${input.idempotencyKey ?? null}
        `;
        if (!existing) throw new Error("Task insert did not return a row");
        return mapTask(existing);
      }
      const row = inserted;
      // One statement per attachment turned a task with ten articles into a round trip
      // each. A multi-row insert costs the same as a single-row one.
      if (input.articleIds.length > 0) {
        const values = input.articleIds.map((articleId) => ({
          task_id: row.id,
          article_id: articleId,
        }));
        await tx`
          INSERT INTO task_articles ${tx(values, "task_id", "article_id")}
          ON CONFLICT DO NOTHING
        `;
      }
      if (input.links.length > 0) {
        const values = input.links.map((url) => ({
          task_id: row.id,
          url,
          created_by: actor.userId,
        }));
        await tx`
          INSERT INTO task_links ${tx(values, "task_id", "url", "created_by")}
          ON CONFLICT DO NOTHING
        `;
      }
      return mapTask(row);
    });
  }

  async listTasks(
    brainId: string,
    actor: Actor,
    page?: { limit: number; offset: number },
  ): Promise<Task[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT * FROM tasks WHERE brain_id = ${brainId}
        ORDER BY priority DESC, created_at ASC, id ASC
        ${page ? tx`LIMIT ${page.limit} OFFSET ${page.offset}` : tx``}
      `;
      return rows.map(mapTask);
    });
  }

  async getTask(id: string, actor: Actor): Promise<Task | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`SELECT * FROM tasks WHERE id = ${id}`;
      return row ? mapTask(row) : null;
    });
  }

  async claimTask(
    brainId: string,
    taskId: string | undefined,
    actor: Actor,
    leaseSeconds: number,
  ): Promise<Task | null> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        WITH candidate AS (
          SELECT id FROM tasks
          WHERE brain_id = ${brainId}
            AND (${taskId ?? null}::uuid IS NULL OR id = ${taskId ?? null}::uuid)
            AND status NOT IN ('completed', 'cancelled', 'approved')
            AND (claimed_by IS NULL OR lease_expires_at < now())
          ORDER BY priority DESC, created_at ASC
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE tasks t SET
          claimed_by = ${actor.userId}, claimed_client_id = ${actor.clientId},
          lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
          status = 'claimed', updated_at = now()
        FROM candidate WHERE t.id = candidate.id RETURNING t.*
      `;
      return rows[0] ? mapTask(rows[0]) : null;
    });
  }

  async heartbeatTask(taskId: string, actor: Actor, leaseSeconds: number): Promise<Task> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        UPDATE tasks SET lease_expires_at = now() + (${leaseSeconds} * interval '1 second'), updated_at = now()
        WHERE id = ${taskId} AND claimed_by = ${actor.userId} AND lease_expires_at >= now()
        RETURNING *
      `;
      if (!row)
        throw new ConflictError("The task lease is absent, expired, or owned by another actor");
      return mapTask(row);
    });
  }

  async releaseTask(taskId: string, actor: Actor, force: boolean): Promise<Task> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        UPDATE tasks SET claimed_by = NULL, claimed_client_id = NULL, lease_expires_at = NULL,
          status = CASE WHEN status = 'claimed' THEN 'open' ELSE status END, updated_at = now()
        WHERE id = ${taskId} AND (${force} OR claimed_by = ${actor.userId}) RETURNING *
      `;
      if (!row) throw new ForbiddenError("This task is claimed by another actor");
      return mapTask(row);
    });
  }

  async updateTask(
    taskId: string,
    actor: Actor,
    patch: Partial<Pick<Task, "status" | "title" | "brief" | "priority">>,
  ): Promise<Task> {
    return this.withActor(actor, async (tx) => {
      const [current] = await tx<any[]>`SELECT * FROM tasks WHERE id = ${taskId} FOR UPDATE`;
      if (!current) throw new NotFoundError("Task");
      const status = patch.status ?? current.status;
      // A task reopened or closed while claimed kept its lease, and claimTask refuses a
      // live lease, so nobody else could pick the reopened task up until it lapsed.
      const releaseLease =
        patch.status !== undefined &&
        patch.status !== current.status &&
        ["open", "approved", "completed", "cancelled"].includes(patch.status);
      const [row] = await tx<any[]>`
        UPDATE tasks SET
          status = ${status}, title = ${patch.title ?? current.title},
          brief = ${patch.brief ?? current.brief}, priority = ${patch.priority ?? current.priority},
          claimed_by = CASE WHEN ${releaseLease} THEN NULL ELSE claimed_by END,
          claimed_client_id = CASE WHEN ${releaseLease} THEN NULL ELSE claimed_client_id END,
          lease_expires_at = CASE WHEN ${releaseLease} THEN NULL ELSE lease_expires_at END,
          updated_at = now()
        WHERE id = ${taskId} RETURNING *
      `;
      return mapTask(row);
    });
  }

  async addTaskComment(taskId: string, actor: Actor, body: string): Promise<void> {
    await this.withActor(actor, async (tx) => {
      await tx`
        INSERT INTO task_comments (task_id, body, actor_id, client_id)
        VALUES (${taskId}, ${body}, ${actor.userId}, ${actor.clientId})
      `;
    });
  }

  async listTaskComments(taskId: string, actor: Actor) {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT id, body, actor_id, client_id, created_at
        FROM task_comments WHERE task_id = ${taskId} ORDER BY created_at
      `;
      return rows.map((row) => ({
        id: row.id as string,
        body: row.body as string,
        actorId: row.actor_id as string,
        clientId: row.client_id ?? null,
        createdAt: asDate(row.created_at).toISOString(),
      }));
    });
  }

  async attachTaskLink(
    taskId: string,
    url: string,
    label: string | null,
    actor: Actor,
  ): Promise<void> {
    await this.withActor(actor, async (tx) => {
      await tx`
        INSERT INTO task_links (task_id, url, label, created_by)
        VALUES (${taskId}, ${url}, ${label}, ${actor.userId})
        ON CONFLICT (task_id, url) DO UPDATE SET label = excluded.label
      `;
    });
  }

  async linkTaskArticle(taskId: string, articleId: string, actor: Actor): Promise<void> {
    await this.withActor(actor, async (tx) => {
      const [valid] = await tx<any[]>`
        SELECT 1 FROM tasks t JOIN articles a ON a.brain_id = t.brain_id
        WHERE t.id = ${taskId} AND a.id = ${articleId}
      `;
      if (!valid) throw new ConflictError("Task and article must belong to the same brain");
      await tx`
        INSERT INTO task_articles (task_id, article_id) VALUES (${taskId}, ${articleId})
        ON CONFLICT DO NOTHING
      `;
    });
  }

  async scanMaintenance(brainId: string, actor: Actor): Promise<MaintenanceCandidate[]> {
    return this.withActor(actor, async (tx) => {
      await tx`
        UPDATE articles SET freshness = 'review_due', updated_at = now()
        WHERE brain_id = ${brainId} AND archived_at IS NULL
          AND review_after IS NOT NULL AND review_after < now() AND freshness = 'current'
      `;
      await tx`
        INSERT INTO maintenance_candidates (brain_id, kind, article_ids, score, detail, fingerprint)
        SELECT a.brain_id, 'stale', ARRAY[a.id], NULL,
          jsonb_build_object('reviewAfter', a.review_after), 'stale:' || a.id::text
        FROM articles a
        WHERE a.brain_id = ${brainId} AND a.archived_at IS NULL
          AND a.review_after IS NOT NULL AND a.review_after < now()
        ON CONFLICT (brain_id, fingerprint) DO UPDATE SET updated_at = now(), status = 'open'
          WHERE maintenance_candidates.status <> 'dismissed'
      `;
      await tx`
        INSERT INTO maintenance_candidates (brain_id, kind, article_ids, score, detail, fingerprint)
        SELECT a.brain_id, 'oversized', ARRAY[a.id], NULL,
          jsonb_build_object('encryptedBytes', octet_length(v.body_ciphertext)), 'oversized:' || a.id::text
        FROM articles a
        JOIN article_versions v ON v.article_id = a.id AND v.version = a.current_version
        WHERE a.brain_id = ${brainId} AND a.archived_at IS NULL
          AND octet_length(v.body_ciphertext) > 48000
        ON CONFLICT (brain_id, fingerprint) DO UPDATE SET updated_at = now(), status = 'open'
          WHERE maintenance_candidates.status <> 'dismissed'
      `;
      // Every pair in the brain used to be compared, which is quadratic in articles and
      // used no index. Each article now asks for its five nearest neighbours in the same
      // vector space, and only pairs above the threshold survive. Dismissed candidates
      // stay dismissed: the condition that produced them is expected to persist.
      await tx`
        WITH current_vectors AS (
          SELECT a.id AS article_id, a.brain_id, ae.embedding, ae.model
          FROM articles a
          JOIN article_embeddings ae
            ON ae.article_id = a.id AND ae.version = a.current_version AND ae.ordinal = 0
          WHERE a.brain_id = ${brainId} AND a.archived_at IS NULL
        ), pairs AS (
          SELECT DISTINCT ON (least(left_v.article_id, neighbour.article_id), greatest(left_v.article_id, neighbour.article_id))
            left_v.brain_id,
            least(left_v.article_id, neighbour.article_id) AS left_id,
            greatest(left_v.article_id, neighbour.article_id) AS right_id,
            neighbour.similarity
          FROM current_vectors left_v
          JOIN LATERAL (
            SELECT a.id AS article_id,
              (1 - (ae.embedding <=> left_v.embedding))::float8 AS similarity
            FROM article_embeddings ae
            JOIN articles a ON a.id = ae.article_id AND a.current_version = ae.version
            WHERE ae.ordinal = 0 AND ae.model = left_v.model
              AND a.brain_id = left_v.brain_id AND a.archived_at IS NULL
              AND a.id <> left_v.article_id
            ORDER BY ae.embedding <=> left_v.embedding
            LIMIT 5
          ) neighbour ON neighbour.similarity >= 0.92
        )
        INSERT INTO maintenance_candidates (brain_id, kind, article_ids, score, detail, fingerprint)
        SELECT brain_id, 'duplicate', ARRAY[left_id, right_id], similarity,
          jsonb_build_object('similarity', similarity),
          'duplicate:' || left_id::text || ':' || right_id::text
        FROM pairs
        ON CONFLICT (brain_id, fingerprint) DO UPDATE SET
          score = excluded.score, detail = excluded.detail, updated_at = now(), status = 'open'
          WHERE maintenance_candidates.status <> 'dismissed'
      `;
      await tx`
        INSERT INTO maintenance_candidates (brain_id, kind, article_ids, score, detail, fingerprint)
        SELECT source.brain_id, 'broken_link', ARRAY[source.id, target.id], NULL,
          jsonb_build_object('targetSlug', target.slug, 'relation', links.relation),
          'broken-link:' || source.id::text || ':' || target.id::text || ':' || links.relation
        FROM article_links links
        JOIN articles source ON source.id = links.from_article_id
        JOIN articles target ON target.id = links.to_article_id
        WHERE source.brain_id = ${brainId} AND source.archived_at IS NULL AND target.archived_at IS NOT NULL
        ON CONFLICT (brain_id, fingerprint) DO UPDATE SET updated_at = now(), status = 'open'
          WHERE maintenance_candidates.status <> 'dismissed'
      `;
      await tx`
        INSERT INTO maintenance_candidates (brain_id, kind, article_ids, score, detail, fingerprint)
        SELECT brain_id, 'potential_conflict', ARRAY[article_id], NULL,
          jsonb_build_object('writeId', id, 'candidates', potential_conflicts),
          'potential-conflict:' || id::text
        FROM staged_writes
        WHERE brain_id = ${brainId} AND status IN ('pending', 'conflicted')
          AND jsonb_array_length(potential_conflicts) > 0
        ON CONFLICT (brain_id, fingerprint) DO UPDATE SET
          detail = excluded.detail, updated_at = now(), status = 'open'
          WHERE maintenance_candidates.status <> 'dismissed'
      `;
      return this.listMaintenanceInTx(tx, brainId);
    });
  }

  async listMaintenance(
    brainId: string,
    actor: Actor,
    page?: { limit: number; offset: number },
  ): Promise<MaintenanceCandidate[]> {
    return this.withActor(actor, (tx) => this.listMaintenanceInTx(tx, brainId, page));
  }

  async getMaintenanceCandidate(
    candidateId: string,
    actor: Actor,
  ): Promise<MaintenanceCandidate | null> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        SELECT * FROM maintenance_candidates WHERE id = ${candidateId}
      `;
      return row ? mapMaintenance(row) : null;
    });
  }

  async updateMaintenance(
    candidateId: string,
    status: "resolved" | "dismissed",
    actor: Actor,
  ): Promise<MaintenanceCandidate> {
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        UPDATE maintenance_candidates SET status = ${status}, updated_at = now()
        WHERE id = ${candidateId} RETURNING *
      `;
      if (!row) throw new NotFoundError("Maintenance candidate");
      return mapMaintenance(row);
    });
  }

  async audit(
    actor: Actor,
    action: string,
    resource: string,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    const brainMatch = /^brain:([0-9a-f-]{36})$/i.exec(resource);
    const articleId = /^article:([0-9a-f-]{36})$/i.exec(resource)?.[1];
    const taskId = /^task:([0-9a-f-]{36})$/i.exec(resource)?.[1];
    const writeId = /^write:([0-9a-f-]{36})$/i.exec(resource)?.[1];
    await this.withActor(actor, async (tx) => {
      let brainId = brainMatch?.[1] ?? null;
      if (!brainId && articleId) {
        const [row] = await tx<any[]>`SELECT brain_id FROM articles WHERE id = ${articleId}`;
        brainId = row?.brain_id ?? null;
      }
      if (!brainId && taskId) {
        const [row] = await tx<any[]>`SELECT brain_id FROM tasks WHERE id = ${taskId}`;
        brainId = row?.brain_id ?? null;
      }
      // Staged, promoted, and withdrawn writes audit under the write id. Without this
      // lookup they land with no brain or workspace, so the brain's activity trail and the
      // team leaderboard could not see the one action a shared brain exists for.
      if (!brainId && writeId) {
        const [row] = await tx<any[]>`SELECT brain_id FROM staged_writes WHERE id = ${writeId}`;
        brainId = row?.brain_id ?? null;
      }
      const teamMatch = resource.match(/^team:([0-9a-f-]{36})$/i);
      const workspaceMatch = resource.match(/^workspace:([0-9a-f-]{36})$/i);
      const workspaceId =
        workspaceMatch?.[1] ??
        (brainId
          ? ((await tx<any[]>`SELECT workspace_id FROM brains WHERE id = ${brainId}`)[0]
              ?.workspace_id ?? null)
          : null);
      const teamId =
        teamMatch?.[1] ??
        (workspaceId
          ? ((await tx<any[]>`SELECT team_id FROM workspaces WHERE id = ${workspaceId}`)[0]
              ?.team_id ?? null)
          : null);
      await tx`
        INSERT INTO audit_events (team_id, workspace_id, brain_id, actor_id, client_id, action, resource, detail)
        VALUES (${teamId}, ${workspaceId}, ${brainId}, ${actor.userId}, ${actor.clientId}, ${action}, ${resource}, ${JSON.stringify(detail)}::jsonb)
      `;
    });
  }

  async createInvitation(
    brainId: string,
    email: string,
    role: BrainRole,
    tokenHash: string,
    expiresAt: Date,
    actor: Actor,
  ) {
    return this.withActor(actor, async (tx) => {
      const [brain] = await tx<any[]>`SELECT workspace_id FROM brains WHERE id = ${brainId}`;
      if (!brain) throw new NotFoundError("Brain");
      const [row] = await tx<any[]>`
        INSERT INTO invitations (
          workspace_id, brain_id, email, workspace_role, brain_role,
          token_hash, expires_at, invited_by
        ) VALUES (
          ${brain.workspace_id}, ${brainId}, ${email}, 'member', ${role},
          ${tokenHash}, ${expiresAt.toISOString()}, ${actor.userId}
        ) RETURNING id, expires_at
      `;
      if (!row) throw new Error("Invitation insert did not return a row");
      return { id: row.id as string, expiresAt: asDate(row.expires_at) };
    });
  }

  async recentActivity(brainId: string, actor: Actor, limit: number, source?: "mcp", offset = 0) {
    return this.withActor(actor, async (tx) => {
      // Browser sessions audit under WEB_SESSION_CLIENT_ID and predate-it web rows
      // under NULL; source=mcp keeps only events from OAuth agent clients.
      const rows = await tx<any[]>`
        SELECT id, action, resource, actor_id, client_id, detail, created_at
        FROM audit_events WHERE brain_id = ${brainId}
        ${source === "mcp" ? tx`AND client_id IS NOT NULL AND client_id <> ${WEB_SESSION_CLIENT_ID}` : tx``}
        ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}
      `;
      return rows.map((row) => ({
        id: row.id as string,
        action: row.action as string,
        resource: row.resource as string,
        actorId: row.actor_id as string,
        clientId: row.client_id ?? null,
        detail: row.detail ?? {},
        createdAt: asDate(row.created_at).toISOString(),
      }));
    });
  }

  async recordMcpToolCall(input: McpToolCallInput, actor: Actor): Promise<void> {
    const clientId = actor.clientId ?? "unknown-client";
    // 8 is loadContextSchema.maxArticles, the most a single call can deliver, and the
    // mcp_tool_calls_article_limit CHECK. Raising the tool ceiling without raising both
    // trades a rejected insert for silently undercounted articles, so keep them in step.
    const articleIds = [...new Set(input.articleIds)].slice(0, 8);
    await this.withActor(actor, async (tx) => {
      await tx`
        WITH resolved AS (
          SELECT coalesce(
            (
              SELECT id FROM brains
              WHERE id = ${input.brainId ?? null}::uuid
                AND workspace_id = ${input.workspaceId} AND deleted_at IS NULL
            ),
            (
              SELECT a.brain_id FROM articles a
              JOIN brains b ON b.id = a.brain_id
              WHERE a.id = ${input.articleId ?? null}::uuid
                AND b.workspace_id = ${input.workspaceId} AND b.deleted_at IS NULL
            ),
            (
              SELECT w.brain_id FROM staged_writes w
              JOIN brains b ON b.id = w.brain_id
              WHERE w.id = ${input.writeId ?? null}::uuid
                AND b.workspace_id = ${input.workspaceId} AND b.deleted_at IS NULL
            ),
            (
              SELECT t.brain_id FROM tasks t
              JOIN brains b ON b.id = t.brain_id
              WHERE t.id = ${input.taskId ?? null}::uuid
                AND b.workspace_id = ${input.workspaceId} AND b.deleted_at IS NULL
            )
          ) AS brain_id
        ), consumed AS (
          SELECT coalesce(array_agg(a.id ORDER BY a.id), '{}'::uuid[]) AS article_ids
          FROM (
            SELECT DISTINCT unnest(${articleIds}::uuid[]) AS id
          ) requested
          JOIN articles a ON a.id = requested.id
          JOIN brains b ON b.id = a.brain_id
          WHERE b.workspace_id = ${input.workspaceId} AND b.deleted_at IS NULL
        )
        INSERT INTO mcp_tool_calls (
          workspace_id, brain_id, client_id, client_name, tool_name, article_ids
        )
        SELECT
          ${input.workspaceId}, resolved.brain_id, ${clientId},
          coalesce(
            (
              SELECT coalesce(
                nullif(payload->>'clientName', ''),
                nullif(payload->>'client_name', ''),
                ${clientId}
              )
              FROM oauth_records WHERE model = 'Client' AND id = ${clientId}
            ),
            ${clientId}
          ),
          ${input.tool}, consumed.article_ids
        FROM resolved CROSS JOIN consumed
      `;
    });
  }

  async getMcpAnalytics(
    workspaceId: string,
    range: McpAnalyticsRange,
    actor: Actor,
    brainId?: string,
  ): Promise<McpAnalytics> {
    const days = MCP_ANALYTICS_DAYS[range];
    return this.withActor(actor, async (tx) => {
      const [row] = await tx<any[]>`
        WITH clock AS (
          SELECT now() AS generated_at,
            (now() AT TIME ZONE 'UTC')::date AS today_date
        ), bounds AS (
          SELECT generated_at, today_date,
            (today_date::timestamp + interval '1 day') AT TIME ZONE 'UTC' AS tomorrow_start,
            (
              today_date::timestamp - make_interval(days => ${days - 1}::int)
            ) AT TIME ZONE 'UTC' AS range_start,
            today_date - 364 AS heatmap_start_date
          FROM clock
        ), scope AS (
          SELECT greatest(
            w.mcp_usage_started_at,
            coalesce(b.created_at, w.mcp_usage_started_at)
          ) AS tracking_started_at
          FROM workspaces w
          LEFT JOIN brains b ON b.id = ${brainId ?? null}::uuid
            AND b.workspace_id = w.id AND b.deleted_at IS NULL
          WHERE w.id = ${workspaceId}
        ), range_calls AS (
          SELECT c.* FROM mcp_tool_calls c CROSS JOIN bounds
          WHERE c.workspace_id = ${workspaceId}
            AND (${brainId ?? null}::uuid IS NULL OR c.brain_id = ${brainId ?? null})
            AND c.created_at >= bounds.range_start
            AND c.created_at < bounds.tomorrow_start
        ), heatmap_counts AS (
          SELECT (c.created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS calls
          FROM mcp_tool_calls c CROSS JOIN bounds
          WHERE c.workspace_id = ${workspaceId}
            AND (${brainId ?? null}::uuid IS NULL OR c.brain_id = ${brainId ?? null})
            AND c.created_at >= (bounds.heatmap_start_date::timestamp AT TIME ZONE 'UTC')
            AND c.created_at < bounds.tomorrow_start
          GROUP BY day
        )
        SELECT
          scope.tracking_started_at,
          bounds.generated_at,
          (SELECT count(*)::int FROM range_calls) AS calls,
          (SELECT count(DISTINCT client_name)::int FROM range_calls) AS active_clients,
          (
            SELECT count(DISTINCT c.brain_id)::int
            FROM range_calls c
            JOIN brains b ON b.id = c.brain_id
              AND b.workspace_id = ${workspaceId} AND b.deleted_at IS NULL
          ) AS active_brains,
          (
            SELECT count(DISTINCT a.id)::int
            FROM range_calls c
            CROSS JOIN LATERAL unnest(c.article_ids) AS consumed(article_id)
            JOIN articles a ON a.id = consumed.article_id
            JOIN brains b ON b.id = a.brain_id
              AND b.workspace_id = ${workspaceId} AND b.deleted_at IS NULL
          ) AS articles_consumed,
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'date', to_char(days.day, 'YYYY-MM-DD'),
                'calls', days.calls,
                'tracked', days.day >= (scope.tracking_started_at AT TIME ZONE 'UTC')::date
              ) ORDER BY days.day
            )
            FROM (
              SELECT (bounds.heatmap_start_date + series.day_offset)::date AS day,
                coalesce(h.calls, 0)::int AS calls
              FROM bounds
              CROSS JOIN LATERAL generate_series(0, 364) AS series(day_offset)
              LEFT JOIN heatmap_counts h
                ON h.day = (bounds.heatmap_start_date + series.day_offset)::date
            ) days
          ), '[]'::jsonb) AS daily,
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'name', ranked.client_name,
                'calls', ranked.calls,
                'registrations', ranked.registrations,
                'lastUsedAt', ranked.last_used_at
              ) ORDER BY ranked.calls DESC, ranked.last_used_at DESC, lower(ranked.client_name)
            )
            FROM (
              SELECT client_name, count(*)::int AS calls,
                count(DISTINCT client_id)::int AS registrations,
                max(created_at) AS last_used_at
              FROM range_calls GROUP BY client_name
              ORDER BY calls DESC, last_used_at DESC, lower(client_name)
              LIMIT 10
            ) ranked
          ), '[]'::jsonb) AS top_clients,
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', ranked.id,
                'name', ranked.name,
                'calls', ranked.calls,
                'lastUsedAt', ranked.last_used_at
              ) ORDER BY ranked.calls DESC, ranked.last_used_at DESC, lower(ranked.name)
            )
            FROM (
              SELECT b.id, b.name, count(*)::int AS calls,
                max(c.created_at) AS last_used_at
              FROM range_calls c
              JOIN brains b ON b.id = c.brain_id
                AND b.workspace_id = ${workspaceId} AND b.deleted_at IS NULL
              GROUP BY b.id, b.name
              ORDER BY calls DESC, last_used_at DESC, lower(b.name)
              LIMIT 10
            ) ranked
          ), '[]'::jsonb) AS top_brains,
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', ranked.id,
                'brainId', ranked.brain_id,
                'brainName', ranked.brain_name,
                'title', ranked.title,
                'uses', ranked.uses,
                'lastUsedAt', ranked.last_used_at
              ) ORDER BY ranked.uses DESC, ranked.last_used_at DESC, lower(ranked.title)
            )
            FROM (
              SELECT a.id, a.brain_id, b.name AS brain_name, a.title,
                count(*)::int AS uses, max(c.created_at) AS last_used_at
              FROM range_calls c
              CROSS JOIN LATERAL unnest(c.article_ids) AS consumed(article_id)
              JOIN articles a ON a.id = consumed.article_id
              JOIN brains b ON b.id = a.brain_id
                AND b.workspace_id = ${workspaceId} AND b.deleted_at IS NULL
              GROUP BY a.id, a.brain_id, b.name, a.title
              ORDER BY uses DESC, last_used_at DESC, lower(a.title)
              LIMIT 10
            ) ranked
          ), '[]'::jsonb) AS top_articles,
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'tool', ranked.tool_name,
                'calls', ranked.calls,
                'lastUsedAt', ranked.last_used_at
              ) ORDER BY ranked.calls DESC, ranked.last_used_at DESC, ranked.tool_name
            )
            FROM (
              SELECT tool_name, count(*)::int AS calls, max(created_at) AS last_used_at
              FROM range_calls GROUP BY tool_name
              ORDER BY calls DESC, last_used_at DESC, tool_name
              LIMIT 10
            ) ranked
          ), '[]'::jsonb) AS top_tools,
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'userId', ranked.user_id,
                'name', ranked.name,
                'role', ranked.role,
                'actions', ranked.actions,
                'writes', ranked.writes,
                'lastActiveAt', ranked.last_active_at
              ) ORDER BY ranked.actions DESC, ranked.last_active_at DESC NULLS LAST,
                lower(ranked.name), ranked.user_id
            )
            FROM (
              SELECT tm.user_id, tm.role,
                coalesce(nullif(u.display_name, ''), u.email) AS name,
                coalesce(activity.actions, 0)::int AS actions,
                coalesce(activity.writes, 0)::int AS writes,
                activity.last_active_at
              FROM workspaces w
              JOIN team_members tm ON tm.team_id = w.team_id
              JOIN users u ON u.id = tm.user_id
              LEFT JOIN LATERAL (
                SELECT count(*)::int AS actions,
                  count(*) FILTER (WHERE e.action = 'write.promoted')::int AS writes,
                  max(e.created_at) AS last_active_at
                FROM audit_events e CROSS JOIN bounds
                WHERE e.actor_id = tm.user_id
                  AND e.workspace_id = w.id
                  AND (${brainId ?? null}::uuid IS NULL OR e.brain_id = ${brainId ?? null})
                  AND e.action <> 'task.heartbeat'
                  AND e.created_at >= bounds.range_start
                  AND e.created_at < bounds.tomorrow_start
              ) activity ON true
              WHERE w.id = ${workspaceId}
              ORDER BY actions DESC, last_active_at DESC NULLS LAST, lower(name), tm.user_id
              LIMIT 10
            ) ranked
          ), '[]'::jsonb) AS top_members,
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', recent.id,
                'tool', recent.tool_name,
                'clientName', recent.client_name,
                'brainId', recent.brain_id,
                'brainName', recent.brain_name,
                'createdAt', recent.created_at
              ) ORDER BY recent.created_at DESC, recent.id DESC
            )
            FROM (
              SELECT c.id, c.tool_name, c.client_name, c.brain_id, b.name AS brain_name,
                c.created_at
              FROM mcp_tool_calls c
              LEFT JOIN brains b ON b.id = c.brain_id
                AND b.workspace_id = ${workspaceId} AND b.deleted_at IS NULL
              WHERE c.workspace_id = ${workspaceId}
                AND (${brainId ?? null}::uuid IS NULL OR c.brain_id = ${brainId ?? null})
              ORDER BY c.created_at DESC, c.id DESC
              LIMIT 50
            ) recent
          ), '[]'::jsonb) AS recent_calls
        FROM bounds CROSS JOIN scope
      `;
      if (!row) throw new NotFoundError("Workspace");

      const mapTimestamp = (value: Date | string) => asDate(value).toISOString();
      return {
        scope: { workspaceId, brainId: brainId ?? null },
        trackingStartedAt: mapTimestamp(row.tracking_started_at),
        generatedAt: mapTimestamp(row.generated_at),
        timeZone: "UTC",
        range,
        totals: {
          calls: Number(row.calls ?? 0),
          activeClients: Number(row.active_clients ?? 0),
          activeBrains: Number(row.active_brains ?? 0),
          articlesConsumed: Number(row.articles_consumed ?? 0),
        },
        daily: (row.daily ?? []).map((item: any) => ({
          date: String(item.date),
          calls: Number(item.calls),
          tracked: item.tracked === true,
        })),
        topClients: (row.top_clients ?? []).map((item: any) => ({
          name: String(item.name),
          calls: Number(item.calls),
          registrations: Number(item.registrations),
          lastUsedAt: mapTimestamp(item.lastUsedAt),
        })),
        topBrains: (row.top_brains ?? []).map((item: any) => ({
          id: String(item.id),
          name: String(item.name),
          calls: Number(item.calls),
          lastUsedAt: mapTimestamp(item.lastUsedAt),
        })),
        topArticles: (row.top_articles ?? []).map((item: any) => ({
          id: String(item.id),
          brainId: String(item.brainId),
          brainName: String(item.brainName),
          title: String(item.title),
          uses: Number(item.uses),
          lastUsedAt: mapTimestamp(item.lastUsedAt),
        })),
        topTools: (row.top_tools ?? []).map((item: any) => ({
          tool: item.tool,
          calls: Number(item.calls),
          lastUsedAt: mapTimestamp(item.lastUsedAt),
        })),
        topMembers: (row.top_members ?? []).map((item: any) => ({
          userId: String(item.userId),
          name: String(item.name),
          role: item.role as TeamRole,
          actions: Number(item.actions),
          writes: Number(item.writes),
          lastActiveAt: item.lastActiveAt == null ? null : mapTimestamp(item.lastActiveAt),
        })),
        recentCalls: (row.recent_calls ?? []).map((item: any) => ({
          id: String(item.id),
          tool: item.tool,
          clientName: String(item.clientName),
          brainId: item.brainId ? String(item.brainId) : null,
          brainName: item.brainName ? String(item.brainName) : null,
          createdAt: mapTimestamp(item.createdAt),
        })),
      };
    });
  }

  private async persistSources(
    tx: Tx,
    write: StagedWriteRecord,
    version: number,
    actor: Actor,
  ): Promise<void> {
    if (write.sources.length === 0) return;
    // Promotion runs on the write path an agent waits on, and every source cost two
    // round trips. Both inserts batch, so the cost no longer scales with the citation
    // count.
    const values = write.sources.map((source) => ({
      brain_id: write.brainId,
      kind: source.kind,
      locator: source.locator ?? null,
      checksum: source.checksum ?? null,
      label: source.label ?? null,
      metadata: JSON.stringify(source.metadata),
      created_by: actor.userId,
    }));
    const rows = await tx`
      INSERT INTO sources ${tx(values, "brain_id", "kind", "locator", "checksum", "label", "metadata", "created_by")}
      RETURNING id
    `;
    if (rows.length !== write.sources.length) {
      throw new Error("Source insert did not return every row");
    }
    await tx`
      INSERT INTO article_sources ${tx(
        rows.map((row) => ({
          article_id: write.articleId,
          version,
          source_id: row.id as string,
        })),
        "article_id",
        "version",
        "source_id",
      )}
    `;
  }

  private async listMaintenanceInTx(
    tx: Tx,
    brainId: string,
    page?: { limit: number; offset: number },
  ): Promise<MaintenanceCandidate[]> {
    const rows = await tx<any[]>`
      SELECT * FROM maintenance_candidates WHERE brain_id = ${brainId} AND status = 'open'
      ORDER BY created_at ASC, id ASC
      ${page ? tx`LIMIT ${page.limit} OFFSET ${page.offset}` : tx``}
    `;
    return rows.map(mapMaintenance);
  }

  private async withActor<T>(
    actor: Actor,
    callback: (tx: Tx) => Promise<T>,
    extra: { ownerTeamId?: string; workspaceId?: string } = {},
  ): Promise<T> {
    return (await this.client.sql.begin(async (tx) => {
      await setActorConfig(tx, actor, extra);
      return callback(tx);
    })) as T;
  }
}

// Every articles column except search_document. That column is a tsvector maintained by a
// trigger for the full-text index; nothing maps it, but SELECT * shipped it on every row.
// A routing index or a search result set carries hundreds of rows, so it was the largest
// part of those payloads. The list is a constant, never built from input.
const ARTICLE_COLUMNS =
  "id, brain_id, slug, title, summary, keywords, kind, freshness, current_version, " +
  "verified_at, review_after, created_by, created_at, updated_at, archived_at, " +
  "compaction_status, compaction_attempts, compaction_error, compacted_at";
const ARTICLE_COLUMNS_A = ARTICLE_COLUMNS.split(", ")
  .map((column) => `a.${column}`)
  .join(", ");

// Sort keys resolve to constant SQL fragments through this closed record, so caller
// input never reaches tx.unsafe — the same discipline as ARTICLE_COLUMNS above.
const ROUTING_INDEX_ORDER: Record<RoutingIndexSort, string> = {
  updated: "updated_at DESC, slug ASC",
  title: "lower(title) ASC, slug ASC",
};

// brains.updated_at is frozen at creation, so "updated" orders by the newest article
// promote — the same truth the dashboard shows. Sorting lives in SQL because the list
// is paged; a client-side sort would only ever reorder the visible page.
const LATEST_ARTICLE_AT =
  "(SELECT MAX(a.updated_at) FROM articles a WHERE a.brain_id = brains.id AND a.archived_at IS NULL)";
const ARTICLE_COUNT_OF_BRAIN =
  "(SELECT COUNT(*) FROM articles a WHERE a.brain_id = brains.id AND a.archived_at IS NULL)";
const BRAIN_LIST_ORDER: Record<BrainListSort, string> = {
  updated: `COALESCE(${LATEST_ARTICLE_AT}, brains.updated_at) DESC, lower(brains.name) ASC, brains.id ASC`,
  articles: `${ARTICLE_COUNT_OF_BRAIN} DESC, lower(brains.name) ASC, brains.id ASC`,
  name: "lower(brains.name) ASC, brains.slug ASC, brains.id ASC",
};

export async function setActorConfig(
  tx: Tx,
  actor: Actor,
  extra: { ownerBrainId?: string; ownerTeamId?: string; workspaceId?: string } = {},
): Promise<void> {
  const teamIds = [...actor.teamRoles.keys()];
  const manageTeamIds = [...actor.teamRoles]
    .filter(([, role]) => role === "owner" || role === "admin")
    .map(([id]) => id);
  const ownerTeamIds = [...actor.teamRoles]
    .filter(([, role]) => role === "owner")
    .map(([id]) => id);
  if (extra.ownerTeamId) {
    teamIds.push(extra.ownerTeamId);
    manageTeamIds.push(extra.ownerTeamId);
    ownerTeamIds.push(extra.ownerTeamId);
  }
  const workspaceIds = [...actor.workspaceRoles.keys()];
  const manageWorkspaceIds = [...actor.workspaceRoles]
    .filter(([, role]) => role === "owner" || role === "admin")
    .map(([id]) => id);
  const ownerWorkspaceIds = [...actor.workspaceRoles]
    .filter(([, role]) => role === "owner")
    .map(([id]) => id);
  if (extra.workspaceId) workspaceIds.push(extra.workspaceId);
  const brainIds = [...actor.brainRoles.keys()];
  const editBrainIds = [...actor.brainRoles]
    .filter(([, role]) => role === "owner" || role === "editor")
    .map(([id]) => id);
  const ownerBrainIds = [...actor.brainRoles]
    .filter(([, role]) => role === "owner")
    .map(([id]) => id);
  if (extra.ownerBrainId) {
    brainIds.push(extra.ownerBrainId);
    editBrainIds.push(extra.ownerBrainId);
    ownerBrainIds.push(extra.ownerBrainId);
  }
  // One statement rather than ten. Every RLS-scoped call in this store opens a
  // transaction and sets these first, so the round trips were paid on every read: a
  // single-row lookup spent twelve of its thirteen statements getting ready. They are
  // independent settings, so evaluating them in one target list is equivalent.
  await tx`
    SELECT
      set_config('app.user_id', ${actor.userId}, true),
      set_config('app.team_ids', ${teamIds.join(",")}, true),
      set_config('app.manage_team_ids', ${manageTeamIds.join(",")}, true),
      set_config('app.owner_team_ids', ${ownerTeamIds.join(",")}, true),
      set_config('app.workspace_ids', ${workspaceIds.join(",")}, true),
      set_config('app.manage_workspace_ids', ${manageWorkspaceIds.join(",")}, true),
      set_config('app.owner_workspace_ids', ${ownerWorkspaceIds.join(",")}, true),
      set_config('app.brain_ids', ${brainIds.join(",")}, true),
      set_config('app.edit_brain_ids', ${editBrainIds.join(",")}, true),
      set_config('app.owner_brain_ids', ${ownerBrainIds.join(",")}, true)
  `;
}

function mapBrain(row: any): BrainRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    wrappedKey: row.wrapped_key as WrappedKey,
    createdBy: row.created_by,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapTeam(row: any): TeamRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    createdAt: asDate(row.created_at),
  };
}

function mapWorkspace(row: any): WorkspaceRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    slug: row.slug,
    name: row.name,
    llmCompactionEnabled: row.llm_compaction_enabled ?? false,
    role: row.role,
    createdAt: asDate(row.created_at),
  };
}

function mapTeamMember(row: any): TeamMemberRecord {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: asDate(row.created_at),
  };
}

function mapTeamInvitation(row: any): TeamInvitationRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: row.role,
    expiresAt: asDate(row.expires_at),
    createdAt: asDate(row.created_at),
  };
}

function mapArticle(row: any): ArticleRecord {
  return {
    id: row.id,
    brainId: row.brain_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    keywords: row.keywords ?? [],
    kind: row.kind,
    freshness: row.freshness,
    currentVersion: Number(row.current_version),
    verifiedAt: row.verified_at ? asDate(row.verified_at) : null,
    reviewAfter: row.review_after ? asDate(row.review_after) : null,
    archivedAt: row.archived_at ? asDate(row.archived_at) : null,
    createdBy: row.created_by,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
    compactionStatus: row.compaction_status ?? "not_requested",
    compactionAttempts: Number(row.compaction_attempts ?? 0),
    compactionError: row.compaction_error ?? null,
    compactedAt: row.compacted_at ? asDate(row.compacted_at) : null,
  };
}

function mapVersion(row: any): VersionRecord {
  return {
    id: row.id,
    brainId: row.brain_id,
    articleId: row.article_id,
    version: Number(row.version),
    body: envelopeFromRow(row),
    bodyAad: row.body_aad,
    bodyHash: row.body_hash,
    changeSummary: row.change_summary,
    sources: (row.sources ?? []) as SourceInput[],
    actorId: row.actor_id,
    clientId: row.client_id ?? null,
    createdAt: asDate(row.created_at),
  };
}

function mapWrite(row: any): StagedWriteRecord {
  return {
    id: row.id,
    brainId: row.brain_id,
    articleId: row.article_id,
    operation: row.operation,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    keywords: row.keywords ?? [],
    kind: row.kind,
    baseVersion: row.base_version === null ? null : Number(row.base_version),
    body: envelopeFromRow(row),
    bodyAad: row.body_aad,
    bodyHash: row.body_hash,
    changeSummary: row.change_summary,
    sources: (row.sources ?? []) as SourceInput[],
    status: row.status,
    potentialConflicts: row.potential_conflicts ?? [],
    acknowledgedConflicts: row.acknowledged_conflicts,
    stagedBy: row.staged_by,
    stagedClientId: row.staged_client_id ?? null,
    promotedBy: row.promoted_by ?? null,
    promotedVersion: row.promoted_version === null ? null : Number(row.promoted_version),
    decisionSummary: row.decision_summary ?? null,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapCompactionJob(row: any): CompactionJobRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brainId: row.brain_id,
    articleId: row.article_id,
    articleVersion: Number(row.article_version),
    sourceTitle: row.source_title,
    status: row.status,
    attempts: Number(row.attempts),
    availableAt: asDate(row.available_at),
    claimedBy: row.claimed_by ?? null,
    leaseExpiresAt: row.lease_expires_at ? asDate(row.lease_expires_at) : null,
    lastError: row.last_error ?? null,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function mapTask(row: any): Task {
  return {
    id: row.id,
    brainId: row.brain_id,
    title: row.title,
    brief: row.brief,
    priority: Number(row.priority),
    status: row.status,
    claimedBy: row.claimed_by ?? null,
    leaseExpiresAt: row.lease_expires_at ? asDate(row.lease_expires_at).toISOString() : null,
    createdAt: asDate(row.created_at).toISOString(),
    updatedAt: asDate(row.updated_at).toISOString(),
  };
}

function mapMaintenance(row: any): MaintenanceCandidate {
  return {
    id: row.id,
    brainId: row.brain_id,
    kind: row.kind,
    articleIds: row.article_ids,
    score: row.score === null ? null : Number(row.score),
    detail: row.detail ?? {},
    status: row.status,
    createdAt: asDate(row.created_at).toISOString(),
  } as MaintenanceCandidate;
}

function envelopeFromRow(row: any): CipherEnvelope {
  return {
    version: Number(row.cipher_version),
    nonce: encode(row.body_nonce),
    ciphertext: encode(row.body_ciphertext),
    tag: encode(row.body_tag),
  };
}

function toArticleSummary(article: ArticleRecord) {
  return {
    id: article.id,
    brainId: article.brainId,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    keywords: article.keywords,
    kind: article.kind,
    freshness: article.freshness,
    currentVersion: article.currentVersion,
    updatedAt: article.updatedAt.toISOString(),
  };
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function encode(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
