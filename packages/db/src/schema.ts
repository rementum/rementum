import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const brainRole = pgEnum("brain_role", ["owner", "editor", "commenter", "viewer"]);
export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member"]);
export const teamRole = pgEnum("team_role", ["owner", "admin", "member"]);
export const articleKind = pgEnum("article_kind", ["canonical", "log"]);
export const freshness = pgEnum("freshness", ["current", "review_due", "stale", "unknown"]);
export const writeOperation = pgEnum("write_operation", ["create", "update", "append"]);
export const writeStatus = pgEnum("write_status", [
  "pending",
  "promoted",
  "conflicted",
  "withdrawn",
]);
export const compactionStatus = pgEnum("compaction_status", [
  "not_requested",
  "queued",
  "processing",
  "compacted",
  "failed",
]);
export const taskStatus = pgEnum("task_status", [
  "open",
  "claimed",
  "blocked",
  "review",
  "approved",
  "completed",
  "cancelled",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    systemOwner: boolean("system_owner").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${table.email})`)],
);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    llmCompactionEnabled: boolean("llm_compaction_enabled").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspaces_team_slug_uq").on(table.teamId, table.slug)],
);

export const brains = pgTable(
  "brains",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    wrappedKey: jsonb("wrapped_key").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("brains_workspace_slug_uq").on(table.workspaceId, table.slug)],
);

export const brainMembers = pgTable(
  "brain_members",
  {
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: brainRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.brainId, table.userId] })],
);

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    kind: articleKind("kind").notNull().default("canonical"),
    freshness: freshness("freshness").notNull().default("unknown"),
    currentVersion: integer("current_version").notNull().default(1),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reviewAfter: timestamp("review_after", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    compactionStatus: compactionStatus("compaction_status").notNull().default("not_requested"),
    compactionAttempts: integer("compaction_attempts").notNull().default(0),
    compactionError: text("compaction_error"),
    compactedAt: timestamp("compacted_at", { withTimezone: true }),
    wikiLinksBodyHash: text("wiki_links_body_hash"),
    searchDocument: customType<{ data: string }>({ dataType: () => "tsvector" })("search_document"),
  },
  (table) => [
    uniqueIndex("articles_brain_slug_uq").on(table.brainId, table.slug),
    uniqueIndex("articles_brain_id_id_uq").on(table.brainId, table.id),
    index("articles_search_idx").using("gin", table.searchDocument),
  ],
);

export const articleVersions = pgTable(
  "article_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    bodyCiphertext: bytea("body_ciphertext").notNull(),
    bodyNonce: bytea("body_nonce").notNull(),
    bodyTag: bytea("body_tag").notNull(),
    cipherVersion: integer("cipher_version").notNull().default(1),
    bodyAad: text("body_aad").notNull(),
    bodyHash: text("body_hash").notNull(),
    changeSummary: text("change_summary").notNull(),
    sources: jsonb("sources").notNull().default([]),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("article_versions_article_version_uq").on(table.articleId, table.version),
  ],
);

export const articleCompactionJobs = pgTable(
  "article_compaction_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").notNull(),
    articleVersion: integer("article_version").notNull(),
    sourceTitle: text("source_title").notNull(),
    status: compactionStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    claimedBy: text("claimed_by"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.articleId, table.articleVersion],
      foreignColumns: [articleVersions.articleId, articleVersions.version],
      name: "article_compaction_jobs_article_version_fkey",
    }).onDelete("cascade"),
    uniqueIndex("article_compaction_jobs_article_version_uq").on(
      table.articleId,
      table.articleVersion,
    ),
    index("article_compaction_jobs_claim_idx").on(table.status, table.availableAt, table.createdAt),
  ],
);

export const stagedWrites = pgTable(
  "staged_writes",
  {
    id: uuid("id").primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").notNull(),
    operation: writeOperation("operation").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    slugAliases: text("slug_aliases").array().notNull().default(sql`'{}'::text[]`),
    kind: articleKind("kind").notNull(),
    baseVersion: integer("base_version"),
    bodyCiphertext: bytea("body_ciphertext").notNull(),
    bodyNonce: bytea("body_nonce").notNull(),
    bodyTag: bytea("body_tag").notNull(),
    cipherVersion: integer("cipher_version").notNull().default(1),
    bodyAad: text("body_aad").notNull(),
    bodyHash: text("body_hash").notNull(),
    changeSummary: text("change_summary").notNull(),
    sources: jsonb("sources").notNull().default([]),
    status: writeStatus("status").notNull().default("pending"),
    potentialConflicts: jsonb("potential_conflicts").notNull().default([]),
    acknowledgedConflicts: boolean("acknowledged_conflicts").notNull().default(false),
    stagedBy: uuid("staged_by")
      .notNull()
      .references(() => users.id),
    stagedClientId: text("staged_client_id"),
    promotedBy: uuid("promoted_by").references(() => users.id),
    promotedVersion: integer("promoted_version"),
    decisionSummary: text("decision_summary"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("staged_writes_actor_idempotency_uq")
      .on(table.stagedBy, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index("staged_writes_brain_status_idx").on(table.brainId, table.status),
  ],
);

export const articleSlugRegistry = pgTable(
  "article_slug_registry",
  {
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    articleId: uuid("article_id").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.brainId, table.slug] }),
    foreignKey({
      columns: [table.brainId, table.articleId],
      foreignColumns: [articles.brainId, articles.id],
      name: "article_slug_registry_brain_article_fkey",
    }).onDelete("cascade"),
    uniqueIndex("article_slug_registry_current_uq")
      .on(table.articleId)
      .where(sql`${table.isCurrent}`),
    index("article_slug_registry_article_idx").on(table.articleId),
  ],
);

export const articleWikiLinks = pgTable(
  "article_wiki_links",
  {
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    fromArticleId: uuid("from_article_id").notNull(),
    targetSlug: text("target_slug").notNull(),
    toArticleId: uuid("to_article_id").references(() => articles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.fromArticleId, table.targetSlug] }),
    foreignKey({
      columns: [table.brainId, table.fromArticleId],
      foreignColumns: [articles.brainId, articles.id],
      name: "article_wiki_links_brain_source_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.brainId, table.toArticleId],
      foreignColumns: [articles.brainId, articles.id],
      name: "article_wiki_links_brain_target_fkey",
    }),
    index("article_wiki_links_target_idx").on(table.brainId, table.toArticleId),
    index("article_wiki_links_unresolved_idx")
      .on(table.brainId, table.targetSlug)
      .where(sql`${table.toArticleId} is null`),
  ],
);

export const articleEmbeddings = pgTable(
  "article_embeddings",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    ordinal: integer("ordinal").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.version, table.ordinal] }),
    index("article_embeddings_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    brief: text("brief").notNull(),
    priority: integer("priority").notNull().default(0),
    status: taskStatus("status").notNull().default("open"),
    claimedBy: uuid("claimed_by").references(() => users.id),
    claimedClientId: text("claimed_client_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tasks_claim_idx").on(table.brainId, table.status, table.priority, table.createdAt),
    uniqueIndex("tasks_actor_idempotency_uq")
      .on(table.createdBy, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  clientId: text("client_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const maintenanceCandidates = pgTable(
  "maintenance_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    articleIds: uuid("article_ids").array().notNull(),
    score: text("score"),
    detail: jsonb("detail").notNull().default({}),
    status: text("status").notNull().default("open"),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("maintenance_fingerprint_uq").on(table.brainId, table.fingerprint)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    brainId: uuid("brain_id").references(() => brains.id, { onDelete: "set null" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    clientId: text("client_id"),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_actor_created_idx").on(table.actorId, table.createdAt)],
);

export const oauthRecords = pgTable(
  "oauth_records",
  {
    model: text("model").notNull(),
    id: text("id").notNull(),
    payload: jsonb("payload").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.model, table.id] })],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("auth_tokens_user_purpose_idx").on(table.userId, table.purpose, table.createdAt),
  ],
);

export const webSessions = pgTable(
  "web_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("web_sessions_user_expires_idx").on(table.userId, table.expiresAt),
    index("web_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: teamRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("team_invitations_team_idx").on(table.teamId, table.createdAt)],
);
