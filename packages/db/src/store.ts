import type {
  BrainRole,
  CreateBrainInput,
  CreateTaskInput,
  MaintenanceCandidate,
  PromoteWriteInput,
  SearchArticlesInput,
  SourceInput,
  StageWriteInput,
  Task,
  WorkspaceRole,
} from "@owl-memory/contracts";
import {
  type Actor,
  type ArticleRecord,
  type BrainRecord,
  type CipherEnvelope,
  ConflictError,
  type DataStore,
  ForbiddenError,
  NotFoundError,
  reciprocalRankFusion,
  type SearchHit,
  type StagedWriteRecord,
  type VersionRecord,
  type WrappedKey,
} from "@owl-memory/core";
import type postgres from "postgres";
import type { DatabaseClient } from "./client.js";

type Tx = postgres.TransactionSql;

export class PostgresStore implements DataStore {
  constructor(
    private readonly client: DatabaseClient,
    private readonly embeddingModel = "intfloat/multilingual-e5-small",
  ) {}

  async loadActor(userId: string, clientId: string | null): Promise<Actor> {
    const [row] = await this.client.sql<
      Array<{
        context: {
          workspaceRoles: Record<string, WorkspaceRole>;
          brainRoles: Record<string, BrainRole>;
        };
      }>
    >`SELECT owl_actor_context(${userId}::uuid) AS context`;
    if (!row) throw new NotFoundError("User");
    return {
      userId,
      clientId,
      workspaceRoles: new Map(Object.entries(row.context.workspaceRoles ?? {})),
      brainRoles: new Map(Object.entries(row.context.brainRoles ?? {})),
    };
  }

  async createBrain(
    input: CreateBrainInput,
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

  async listBrains(actor: Actor): Promise<BrainRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT * FROM brains WHERE deleted_at IS NULL ORDER BY updated_at DESC
      `;
      return rows.map(mapBrain);
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

  async listRoutingIndex(brainId: string, actor: Actor, limit: number): Promise<ArticleRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT * FROM articles
        WHERE brain_id = ${brainId} AND archived_at IS NULL
        ORDER BY updated_at DESC, slug ASC LIMIT ${limit}
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

  async listArticleVersions(articleId: string, actor: Actor): Promise<VersionRecord[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT * FROM article_versions WHERE article_id = ${articleId} ORDER BY version DESC
      `;
      return rows.map(mapVersion);
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
      for (const link of links) {
        const [target] = await tx<any[]>`
          SELECT id FROM articles WHERE id = ${link.toArticleId} AND brain_id = ${article.brain_id}
        `;
        if (!target) throw new ConflictError("Article links must remain inside one brain");
        await tx`
          INSERT INTO article_links (from_article_id, to_article_id, relation, created_by)
          VALUES (${articleId}, ${link.toArticleId}, ${link.relation}, ${actor.userId})
        `;
      }
    });
  }

  async createStagedWrite(
    input: StageWriteInput,
    actor: Actor,
    targetArticleId: string,
    writeId: string,
    encrypted: CipherEnvelope,
    bodyAad: string,
    bodyHash: string,
    potentialConflicts: StagedWriteRecord["potentialConflicts"],
  ): Promise<StagedWriteRecord> {
    return this.withActor(actor, async (tx) => {
      if (input.idempotencyKey) {
        const [existing] = await tx<any[]>`
          SELECT * FROM staged_writes
          WHERE staged_by = ${actor.userId} AND idempotency_key = ${input.idempotencyKey}
        `;
        if (existing) return mapWrite(existing);
      }
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
        ) RETURNING *
      `;
      if (!row) throw new Error("Staged write insert did not return a row");
      return mapWrite(row);
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

      let version = 1;
      if (write.operation === "create") {
        const [duplicate] = await tx<any[]>`
          SELECT id, current_version FROM articles
          WHERE brain_id = ${write.brainId} AND slug = ${write.slug} FOR UPDATE
        `;
        if (duplicate) {
          await tx`UPDATE staged_writes SET status = 'conflicted', updated_at = now() WHERE id = ${write.id}`;
          return {
            kind: "conflict" as const,
            currentVersion: duplicate.current_version as number,
          };
        }
        await tx`
          INSERT INTO articles (
            id, brain_id, slug, title, summary, keywords, kind, freshness, current_version, created_by
          ) VALUES (
            ${write.articleId}, ${write.brainId}, ${write.slug}, ${write.title}, ${write.summary},
            ${write.keywords}, ${write.kind}, 'unknown', 1, ${write.stagedBy}
          )
        `;
      } else {
        const [article] = await tx<any[]>`
          SELECT * FROM articles WHERE id = ${write.articleId} FOR UPDATE
        `;
        if (!article) throw new NotFoundError("Article");
        if (article.current_version !== write.baseVersion && input.decision !== "override") {
          await tx`UPDATE staged_writes SET status = 'conflicted', updated_at = now() WHERE id = ${write.id}`;
          return { kind: "conflict" as const, currentVersion: article.current_version as number };
        }
        version = Number(article.current_version) + 1;
        await tx`
          UPDATE articles SET
            slug = ${write.slug}, title = ${write.title}, summary = ${write.summary},
            keywords = ${write.keywords}, kind = ${write.kind}, current_version = ${version},
            freshness = 'current', updated_at = now()
          WHERE id = ${write.articleId}
        `;
      }

      const [versionRow] = await tx<any[]>`
        INSERT INTO article_versions (
          brain_id, article_id, version, body_ciphertext, body_nonce, body_tag, cipher_version,
          body_aad, body_hash, change_summary, sources, actor_id, client_id
        ) VALUES (
          ${write.brainId}, ${write.articleId}, ${version}, ${decode(write.body.ciphertext)},
          ${decode(write.body.nonce)}, ${decode(write.body.tag)}, ${write.body.version},
          ${write.bodyAad}, ${write.bodyHash}, ${write.changeSummary},
          ${JSON.stringify(write.sources)}::jsonb,
          ${actor.userId}, ${actor.clientId}
        ) RETURNING *
      `;
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
    return outcome;
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
    embedding: number[] | null,
  ): Promise<SearchHit[]> {
    return this.withActor(actor, async (tx) => {
      const fts = await tx<any[]>`
        SELECT a.*, ts_rank_cd(a.search_document, websearch_to_tsquery('simple', ${input.query})) AS rank
        FROM articles a
        WHERE a.brain_id = ${input.brainId} AND a.archived_at IS NULL
          AND a.search_document @@ websearch_to_tsquery('simple', ${input.query})
          ${input.freshness?.length ? tx`AND a.freshness = ANY(${input.freshness})` : tx``}
        ORDER BY rank DESC LIMIT 50
      `;
      const vectorRows = embedding
        ? await tx<any[]>`
            SELECT DISTINCT ON (a.id) a.*, (1 - (ae.embedding <=> ${vectorLiteral(embedding)}::vector))::float8 AS rank
            FROM article_embeddings ae
            JOIN articles a ON a.id = ae.article_id AND a.current_version = ae.version
            WHERE a.brain_id = ${input.brainId} AND a.archived_at IS NULL
              ${input.freshness?.length ? tx`AND a.freshness = ANY(${input.freshness})` : tx``}
            ORDER BY a.id, ae.embedding <=> ${vectorLiteral(embedding)}::vector
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
    actor: Actor,
  ): Promise<void> {
    if (vector.length !== 384)
      throw new Error(`Expected 384 dimensions, received ${vector.length}`);
    await this.withActor(actor, async (tx) => {
      await tx`
        INSERT INTO article_embeddings (article_id, version, ordinal, embedding, model)
        VALUES (${articleId}, ${version}, ${ordinal}, ${vectorLiteral(vector)}::vector, ${this.embeddingModel})
        ON CONFLICT (article_id, version, ordinal) DO UPDATE SET
          embedding = excluded.embedding, model = excluded.model, created_at = now()
      `;
    });
  }

  async createTask(input: CreateTaskInput, actor: Actor): Promise<Task> {
    return this.withActor(actor, async (tx) => {
      if (input.idempotencyKey) {
        const [existing] = await tx<any[]>`
          SELECT * FROM tasks WHERE created_by = ${actor.userId} AND idempotency_key = ${input.idempotencyKey}
        `;
        if (existing) return mapTask(existing);
      }
      const [row] = await tx<any[]>`
        INSERT INTO tasks (brain_id, title, brief, priority, created_by, idempotency_key)
        VALUES (${input.brainId}, ${input.title}, ${input.brief}, ${input.priority}, ${actor.userId}, ${input.idempotencyKey ?? null})
        RETURNING *
      `;
      if (!row) throw new Error("Task insert did not return a row");
      for (const articleId of input.articleIds) {
        await tx`INSERT INTO task_articles (task_id, article_id) VALUES (${row.id}, ${articleId}) ON CONFLICT DO NOTHING`;
      }
      for (const url of input.links) {
        await tx`INSERT INTO task_links (task_id, url, created_by) VALUES (${row.id}, ${url}, ${actor.userId}) ON CONFLICT DO NOTHING`;
      }
      return mapTask(row);
    });
  }

  async listTasks(brainId: string, actor: Actor): Promise<Task[]> {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT * FROM tasks WHERE brain_id = ${brainId}
        ORDER BY priority DESC, created_at ASC
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
      const [current] = await tx<any[]>`SELECT * FROM tasks WHERE id = ${taskId}`;
      if (!current) throw new NotFoundError("Task");
      const [row] = await tx<any[]>`
        UPDATE tasks SET
          status = ${patch.status ?? current.status}, title = ${patch.title ?? current.title},
          brief = ${patch.brief ?? current.brief}, priority = ${patch.priority ?? current.priority},
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
      `;
      await tx`
        WITH current_vectors AS (
          SELECT a.id AS article_id, a.brain_id, ae.embedding
          FROM articles a
          JOIN article_embeddings ae
            ON ae.article_id = a.id AND ae.version = a.current_version AND ae.ordinal = 0
          WHERE a.brain_id = ${brainId} AND a.archived_at IS NULL
        ), pairs AS (
          SELECT left_v.brain_id, left_v.article_id AS left_id, right_v.article_id AS right_id,
            (1 - (left_v.embedding <=> right_v.embedding))::float8 AS similarity
          FROM current_vectors left_v
          JOIN current_vectors right_v ON left_v.article_id < right_v.article_id
          WHERE 1 - (left_v.embedding <=> right_v.embedding) >= 0.92
        )
        INSERT INTO maintenance_candidates (brain_id, kind, article_ids, score, detail, fingerprint)
        SELECT brain_id, 'duplicate', ARRAY[left_id, right_id], similarity,
          jsonb_build_object('similarity', similarity),
          'duplicate:' || left_id::text || ':' || right_id::text
        FROM pairs
        ON CONFLICT (brain_id, fingerprint) DO UPDATE SET
          score = excluded.score, detail = excluded.detail, updated_at = now(), status = 'open'
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
      `;
      return this.listMaintenanceInTx(tx, brainId);
    });
  }

  async listMaintenance(brainId: string, actor: Actor): Promise<MaintenanceCandidate[]> {
    return this.withActor(actor, (tx) => this.listMaintenanceInTx(tx, brainId));
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
      const workspaceId = brainId
        ? ((await tx<any[]>`SELECT workspace_id FROM brains WHERE id = ${brainId}`)[0]
            ?.workspace_id ?? null)
        : null;
      await tx`
        INSERT INTO audit_events (workspace_id, brain_id, actor_id, client_id, action, resource, detail)
        VALUES (${workspaceId}, ${brainId}, ${actor.userId}, ${actor.clientId}, ${action}, ${resource}, ${JSON.stringify(detail)}::jsonb)
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

  async recentActivity(brainId: string, actor: Actor, limit: number) {
    return this.withActor(actor, async (tx) => {
      const rows = await tx<any[]>`
        SELECT id, action, resource, actor_id, client_id, detail, created_at
        FROM audit_events WHERE brain_id = ${brainId}
        ORDER BY created_at DESC LIMIT ${limit}
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

  private async persistSources(
    tx: Tx,
    write: StagedWriteRecord,
    version: number,
    actor: Actor,
  ): Promise<void> {
    for (const source of write.sources) {
      const [row] = await tx<any[]>`
        INSERT INTO sources (brain_id, kind, locator, checksum, label, metadata, created_by)
        VALUES (${write.brainId}, ${source.kind}, ${source.locator ?? null}, ${source.checksum ?? null},
          ${source.label ?? null}, ${JSON.stringify(source.metadata)}::jsonb, ${actor.userId})
        RETURNING id
      `;
      if (!row) throw new Error("Source insert did not return a row");
      await tx`
        INSERT INTO article_sources (article_id, version, source_id)
        VALUES (${write.articleId}, ${version}, ${row.id})
      `;
    }
  }

  private async listMaintenanceInTx(tx: Tx, brainId: string): Promise<MaintenanceCandidate[]> {
    const rows = await tx<any[]>`
      SELECT * FROM maintenance_candidates WHERE brain_id = ${brainId} AND status = 'open'
      ORDER BY created_at ASC
    `;
    return rows.map(mapMaintenance);
  }

  private async withActor<T>(actor: Actor, callback: (tx: Tx) => Promise<T>): Promise<T> {
    return (await this.client.sql.begin(async (tx) => {
      await setActorConfig(tx, actor);
      return callback(tx);
    })) as T;
  }
}

export async function setActorConfig(
  tx: Tx,
  actor: Actor,
  extra: { ownerBrainId?: string } = {},
): Promise<void> {
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
  await tx`SELECT set_config('app.user_id', ${actor.userId}, true)`;
  await tx`SELECT set_config('app.workspace_ids', ${[...actor.workspaceRoles.keys()].join(",")}, true)`;
  await tx`SELECT set_config('app.brain_ids', ${brainIds.join(",")}, true)`;
  await tx`SELECT set_config('app.edit_brain_ids', ${editBrainIds.join(",")}, true)`;
  await tx`SELECT set_config('app.owner_brain_ids', ${ownerBrainIds.join(",")}, true)`;
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
