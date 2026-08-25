import { z } from "zod";

export const idSchema = z.uuid();
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase kebab-case");

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const brainRoleSchema = z.enum(["owner", "editor", "commenter", "viewer"]);
export type BrainRole = z.infer<typeof brainRoleSchema>;

export const articleKindSchema = z.enum(["canonical", "log"]);
export type ArticleKind = z.infer<typeof articleKindSchema>;

export const freshnessSchema = z.enum(["current", "review_due", "stale", "unknown"]);
export type Freshness = z.infer<typeof freshnessSchema>;

export const writeOperationSchema = z.enum(["create", "update", "append"]);
export type WriteOperation = z.infer<typeof writeOperationSchema>;

export const writeStatusSchema = z.enum(["pending", "promoted", "conflicted", "withdrawn"]);
export type WriteStatus = z.infer<typeof writeStatusSchema>;

export const taskStatusSchema = z.enum([
  "open",
  "claimed",
  "blocked",
  "review",
  "approved",
  "completed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const sourceSchema = z.object({
  kind: z.enum(["file", "url", "conversation", "import", "other"]),
  locator: z.string().max(2048).optional(),
  checksum: z.string().max(128).optional(),
  label: z.string().max(240).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SourceInput = z.infer<typeof sourceSchema>;

export const articleSummarySchema = z.object({
  id: idSchema,
  brainId: idSchema,
  slug: slugSchema,
  title: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()),
  kind: articleKindSchema,
  freshness: freshnessSchema,
  currentVersion: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type ArticleSummary = z.infer<typeof articleSummarySchema>;

export const articleSchema = articleSummarySchema.extend({
  body: z.string(),
  links: z.array(
    z.object({
      articleId: idSchema,
      slug: slugSchema,
      relation: z.string(),
    }),
  ),
  sources: z.array(sourceSchema.extend({ id: idSchema })),
  verifiedAt: z.iso.datetime().nullable(),
  reviewAfter: z.iso.datetime().nullable(),
  provenance: z.object({
    actorId: idSchema,
    clientId: z.string().nullable(),
    changeSummary: z.string(),
    createdAt: z.iso.datetime(),
  }),
});
export type Article = z.infer<typeof articleSchema>;

export const createBrainSchema = z.object({
  workspaceId: idSchema.optional(),
  slug: slugSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(1000).default(""),
  instructions: z.string().max(10_000).default(""),
});
export type CreateBrainInput = z.infer<typeof createBrainSchema>;

export const teamSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string(),
  role: workspaceRoleSchema,
  createdAt: z.iso.datetime(),
});
export type Team = z.infer<typeof teamSchema>;

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(160),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const createTeamInvitationSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "member"]).default("member"),
});
export type CreateTeamInvitationInput = z.infer<typeof createTeamInvitationSchema>;

export const stageWriteSchema = z
  .object({
    brainId: idSchema,
    operation: writeOperationSchema,
    articleId: idSchema.optional(),
    slug: slugSchema,
    title: z.string().min(1).max(240),
    keywords: z.array(z.string().min(1).max(80)).max(40).default([]),
    kind: articleKindSchema.default("canonical"),
    body: z.string().min(1).max(2_000_000),
    baseVersion: z.number().int().positive().optional(),
    changeSummary: z.string().min(1).max(500),
    sources: z.array(sourceSchema).max(100).default([]),
    acknowledgePotentialConflicts: z.boolean().default(false),
    idempotencyKey: z.string().min(8).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.operation !== "create" && (!value.articleId || !value.baseVersion)) {
      ctx.addIssue({
        code: "custom",
        message: "Updates and appends require articleId and baseVersion",
      });
    }
    if (value.operation === "create" && (value.articleId || value.baseVersion)) {
      ctx.addIssue({
        code: "custom",
        message: "Creates cannot specify articleId or baseVersion",
      });
    }
    if (value.operation === "append" && value.kind !== "log") {
      ctx.addIssue({ code: "custom", message: "Append is only valid for log articles" });
    }
  });
export type StageWriteInput = z.infer<typeof stageWriteSchema>;

export const promoteWriteSchema = z.object({
  writeId: idSchema,
  decision: z.enum(["promote", "exception", "override"]).default("promote"),
  decisionSummary: z.string().min(1).max(500),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
export type PromoteWriteInput = z.infer<typeof promoteWriteSchema>;

export const searchArticlesSchema = z.object({
  brainId: idSchema,
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).default(10),
  freshness: z.array(freshnessSchema).optional(),
});
export type SearchArticlesInput = z.infer<typeof searchArticlesSchema>;

export const taskSchema = z.object({
  id: idSchema,
  brainId: idSchema,
  title: z.string(),
  brief: z.string(),
  priority: z.number().int(),
  status: taskStatusSchema,
  claimedBy: idSchema.nullable(),
  leaseExpiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z.object({
  brainId: idSchema,
  title: z.string().min(1).max(240),
  brief: z.string().min(1).max(20_000),
  priority: z.number().int().min(-100).max(100).default(0),
  articleIds: z.array(idSchema).max(100).default([]),
  links: z.array(z.url()).max(50).default([]),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const claimTaskSchema = z.object({
  taskId: idSchema.optional(),
  brainId: idSchema,
  leaseSeconds: z.number().int().min(60).max(3600).default(600),
});
export type ClaimTaskInput = z.infer<typeof claimTaskSchema>;

export const importPreviewSchema = z.object({
  brainId: idSchema,
  files: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      suggestedSlug: slugSchema,
      suggestedKind: articleKindSchema,
      bytes: z.number().int().nonnegative(),
      links: z.array(z.string()),
      warnings: z.array(z.string()),
    }),
  ),
  unresolvedLinks: z.array(z.string()),
  totalBytes: z.number().int().nonnegative(),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const maintenanceCandidateSchema = z.object({
  id: idSchema,
  brainId: idSchema,
  kind: z.enum(["stale", "oversized", "duplicate", "potential_conflict", "broken_link"]),
  articleIds: z.array(idSchema),
  score: z.number().nullable(),
  detail: z.record(z.string(), z.unknown()),
  status: z.enum(["open", "claimed", "resolved", "dismissed"]),
  createdAt: z.iso.datetime(),
});
export type MaintenanceCandidate = z.infer<typeof maintenanceCandidateSchema>;

export const problemSchema = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
});
export type Problem = z.infer<typeof problemSchema>;

export const toolNames = [
  "list_teams",
  "create_team",
  "propose_team_invite",
  "list_brains",
  "create_brain",
  "get_brain",
  "search_articles",
  "read_article",
  "recent_activity",
  "stage_write",
  "promote_staged_write",
  "withdraw_staged_write",
  "get_write_status",
  "verify_article",
  "set_article_links",
  "import_markdown",
  "export_brain",
  "list_tasks",
  "get_task",
  "create_task",
  "claim_next_task",
  "claim_task",
  "heartbeat_claim",
  "release_claim",
  "force_release_claim",
  "update_task",
  "approve_task",
  "cancel_task",
  "comment_task",
  "attach_task_link",
  "link_task_article",
  "propose_invite",
  "scan_brain",
  "list_maintenance_candidates",
] as const;
export type ToolName = (typeof toolNames)[number];
