import type {
  Article,
  ArticleSummary,
  BrainArticleCount,
  BrainInvitation,
  BrainListSort,
  BrainRole,
  CompactionState,
  CreateBrainInput,
  CreateTaskInput,
  InstanceOverview,
  InstanceUsersPage,
  ListInstanceUsersInput,
  MaintenanceCandidate,
  McpAnalytics,
  McpAnalyticsRange,
  PromoteWriteInput,
  ReviewQueue,
  RoutingIndexSort,
  SearchArticlesInput,
  SourceInput,
  StageWriteInput,
  Task,
  TeamRole,
  ToolName,
} from "@rementum/contracts";
import type { CipherEnvelope, WrappedKey } from "./crypto.js";

export interface Actor {
  userId: string;
  clientId: string | null;
  /**
   * The instance owner flag from `users.system_owner`: the account `create-owner` made.
   * It is instance authority, not tenant authority, so an actor narrowed to one MCP
   * workspace never carries it.
   */
  systemOwner: boolean;
  teamRoles: Map<string, TeamRole>;
  workspaceRoles: Map<string, TeamRole>;
  brainRoles: Map<string, BrainRole>;
}

export interface McpToolCallInput {
  workspaceId: string;
  tool: ToolName;
  brainId?: string;
  articleId?: string;
  writeId?: string;
  taskId?: string;
  articleIds: string[];
}

export interface BrainRecord {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  wrappedKey: WrappedKey;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamRecord {
  id: string;
  slug: string;
  name: string;
  role: TeamRole;
  createdAt: Date;
}

export interface WorkspaceRecord {
  id: string;
  teamId: string;
  slug: string;
  name: string;
  llmCompactionEnabled: boolean;
  role: TeamRole;
  createdAt: Date;
}

export interface TeamMemberRecord {
  userId: string;
  email: string;
  displayName: string;
  role: TeamRole;
  createdAt: Date;
}

export interface TeamInvitationRecord {
  id: string;
  teamId: string;
  email: string;
  role: "admin" | "member";
  expiresAt: Date;
  createdAt: Date;
}

export interface ArticleRecord extends Omit<ArticleSummary, "updatedAt"> {
  archivedAt: Date | null;
  verifiedAt: Date | null;
  reviewAfter: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  compactionStatus: "not_requested" | "queued" | "processing" | "compacted" | "failed";
  compactionAttempts: number;
  compactionError: string | null;
  compactedAt: Date | null;
}

export interface VersionRecord {
  id: string;
  brainId: string;
  articleId: string;
  version: number;
  body: CipherEnvelope;
  bodyAad: string;
  bodyHash: string;
  changeSummary: string;
  sources: SourceInput[];
  actorId: string;
  clientId: string | null;
  createdAt: Date;
}

/** A version without its ciphertext, for history listings that never decrypt. */
export type VersionSummary = Omit<VersionRecord, "body" | "bodyAad">;

/** Everything one article view needs, read together. */
export interface ArticleBundle {
  article: ArticleRecord;
  brain: BrainRecord;
  version: VersionRecord;
  links: Array<{ articleId: string; slug: string; relation: string }>;
  sources: Array<SourceInput & { id: string }>;
  compactionEnabled: boolean;
}

/** One current article body, as the export reads them in bulk. */
export interface ExportedVersion {
  articleId: string;
  slug: string;
  title: string;
  summary: string;
  kind: string;
  version: number;
  body: CipherEnvelope;
  bodyAad: string;
}

export interface StagedWriteRecord {
  id: string;
  brainId: string;
  articleId: string | null;
  operation: StageWriteInput["operation"];
  slug: string;
  title: string;
  summary: string;
  keywords: string[];
  kind: StageWriteInput["kind"];
  baseVersion: number | null;
  body: CipherEnvelope;
  bodyAad: string;
  bodyHash: string;
  changeSummary: string;
  sources: SourceInput[];
  status: "pending" | "promoted" | "conflicted" | "withdrawn";
  potentialConflicts: Array<{ articleId: string; slug: string; score: number }>;
  acknowledgedConflicts: boolean;
  stagedBy: string;
  stagedClientId: string | null;
  promotedBy: string | null;
  promotedVersion: number | null;
  decisionSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchHit {
  article: ArticleSummary;
  score: number;
  sources: string[];
  excerpt: string | null;
}

export interface GeneratedArticle {
  title: string;
  summary: string;
  body: string;
}

export interface CompactionJobRecord {
  id: string;
  workspaceId: string;
  brainId: string;
  articleId: string;
  articleVersion: number;
  sourceTitle: string;
  status: "queued" | "processing" | "failed";
  attempts: number;
  availableAt: Date;
  claimedBy: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimedCompactionJob {
  jobId: string;
  workspaceId: string;
  brainId: string;
  articleId: string;
  articleVersion: number;
  sourceTitle: string;
  attempts: number;
  ownerId: string;
  claimId: string;
}

export interface ArticleCompactionView {
  enabled: boolean;
  available: boolean;
  status: CompactionState;
  attempts: number;
  error: string | null;
  compactedAt: string | null;
  canRetry: boolean;
}

export interface ArticleGenerator {
  generateArticle(input: { title: string; body: string }): Promise<GeneratedArticle>;
}

export type ResolvedStageWriteInput = StageWriteInput & GeneratedArticle;

export interface SealedBody {
  body: CipherEnvelope;
  bodyAad: string;
}

export interface DataStore {
  createTeam(
    name: string,
    slug: string,
    actor: Actor,
    teamId: string,
    workspaceId: string,
  ): Promise<{ team: TeamRecord; workspace: WorkspaceRecord }>;
  listTeams(actor: Actor): Promise<TeamRecord[]>;
  updateTeam(
    teamId: string,
    patch: { name?: string; slug?: string },
    actor: Actor,
  ): Promise<TeamRecord>;
  createWorkspace(
    teamId: string,
    name: string,
    slug: string,
    actor: Actor,
    workspaceId: string,
  ): Promise<WorkspaceRecord>;
  listWorkspaces(actor: Actor, teamId?: string): Promise<WorkspaceRecord[]>;
  getWorkspace(workspaceId: string, actor: Actor): Promise<WorkspaceRecord | null>;
  updateWorkspace(
    workspaceId: string,
    patch: { name?: string; slug?: string; llmCompactionEnabled?: boolean },
    actor: Actor,
  ): Promise<WorkspaceRecord>;
  deleteWorkspace(
    workspaceId: string,
    confirmation: string,
    actor: Actor,
  ): Promise<WorkspaceRecord>;
  deleteTeam(teamId: string, confirmation: string, actor: Actor): Promise<TeamRecord>;
  listTeamMembers(teamId: string, actor: Actor): Promise<TeamMemberRecord[]>;
  updateTeamMemberRole(
    teamId: string,
    userId: string,
    role: "admin" | "member",
    actor: Actor,
  ): Promise<TeamMemberRecord>;
  removeTeamMember(teamId: string, userId: string, actor: Actor): Promise<void>;
  listTeamInvitations(teamId: string, actor: Actor): Promise<TeamInvitationRecord[]>;
  createTeamInvitation(
    teamId: string,
    email: string,
    role: "admin" | "member",
    tokenHash: string,
    expiresAt: Date,
    actor: Actor,
  ): Promise<TeamInvitationRecord>;
  revokeTeamInvitation(invitationId: string, actor: Actor): Promise<TeamInvitationRecord>;
  createBrain(
    input: CreateBrainInput & { workspaceId: string },
    actor: Actor,
    wrappedKey: WrappedKey,
    id: string,
  ): Promise<BrainRecord>;
  listBrains(
    actor: Actor,
    options?: {
      workspaceId?: string;
      excludeWorkspaceIds?: string[];
      sort?: BrainListSort;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: BrainRecord[]; total: number }>;
  countArticlesByBrain(actor: Actor, workspaceId?: string): Promise<BrainArticleCount[]>;
  countArticles(brainId: string, actor: Actor): Promise<number>;
  getBrain(id: string, actor: Actor): Promise<BrainRecord | null>;
  deleteBrain(brainId: string, confirmation: string, actor: Actor): Promise<BrainRecord>;
  isBrainCompactionEnabled(brainId: string, actor: Actor): Promise<boolean>;
  listRoutingIndex(
    brainId: string,
    actor: Actor,
    limit: number,
    sort: RoutingIndexSort,
    offset?: number,
  ): Promise<ArticleRecord[]>;
  getArticle(id: string, actor: Actor): Promise<ArticleRecord | null>;
  getArticleBySlug(brainId: string, slug: string, actor: Actor): Promise<ArticleRecord | null>;
  getVersion(articleId: string, version: number, actor: Actor): Promise<VersionRecord | null>;
  getCurrentVersion(articleId: string, actor: Actor): Promise<VersionRecord | null>;
  getArticleLinks(
    articleId: string,
    actor: Actor,
  ): Promise<Array<{ articleId: string; slug: string; relation: string }>>;
  getArticleSources(
    articleId: string,
    version: number,
    actor: Actor,
  ): Promise<Array<SourceInput & { id: string }>>;
  listArticleVersions(articleId: string, actor: Actor): Promise<VersionSummary[]>;
  /** Null when the article is not visible; throws when its brain or version is missing. */
  readArticleBundle(articleId: string, actor: Actor): Promise<ArticleBundle | null>;
  listCurrentVersions(brainId: string, actor: Actor, limit: number): Promise<ExportedVersion[]>;
  verifyArticle(articleId: string, reviewAfter: Date | null, actor: Actor): Promise<ArticleRecord>;
  setArticleLinks(
    articleId: string,
    links: Array<{ toArticleId: string; relation: string }>,
    actor: Actor,
  ): Promise<void>;
  createStagedWrite(
    input: ResolvedStageWriteInput,
    actor: Actor,
    targetArticleId: string,
    writeId: string,
    encrypted: CipherEnvelope,
    bodyAad: string,
    bodyHash: string,
    potentialConflicts: StagedWriteRecord["potentialConflicts"],
  ): Promise<StagedWriteRecord>;
  getStagedWriteByIdempotencyKey(
    idempotencyKey: string,
    actor: Actor,
  ): Promise<StagedWriteRecord | null>;
  getStagedWrite(id: string, actor: Actor): Promise<StagedWriteRecord | null>;
  listStagedWrites(
    brainId: string,
    actor: Actor,
    status?: StagedWriteRecord["status"],
  ): Promise<StagedWriteRecord[]>;
  withdrawStagedWrite(id: string, actor: Actor): Promise<StagedWriteRecord>;
  listWorkspaceReviewQueue(workspaceId: string, actor: Actor, limit: number): Promise<ReviewQueue>;
  /**
   * `sealVersion` re-encrypts the staged body for the version number the store assigns, so
   * the stored ciphertext is bound to its final position rather than to the staged write.
   */
  promoteStagedWrite(
    input: PromoteWriteInput,
    actor: Actor,
    llmAvailable: boolean,
    sealVersion: (write: StagedWriteRecord, version: number) => SealedBody,
  ): Promise<{ write: StagedWriteRecord; article: ArticleRecord; version: VersionRecord }>;
  queueWorkspaceCurrentCompactions(workspaceId: string, actor: Actor): Promise<number>;
  queueArticleCompaction(articleId: string, actor: Actor): Promise<ArticleRecord>;
  cancelWorkspaceCompactions(workspaceId: string, actor: Actor): Promise<string[]>;
  getCompactionJob(jobId: string, actor: Actor): Promise<CompactionJobRecord | null>;
  extendCompactionLease(jobId: string, claimId: string, leaseSeconds: number): Promise<boolean>;
  /**
   * Stores the compact result as the article's next version, sealed by `sealVersion` for
   * the number the store assigns, so the submitted version stays in history. Returns
   * `current: false` without writing when the source version is no longer current.
   */
  completeCompaction(
    jobId: string,
    claimId: string,
    generated: GeneratedArticle,
    sealVersion: (version: number) => SealedBody,
    bodyHash: string,
    actor: Actor,
  ): Promise<{ current: boolean; articleId: string; version: number } | null>;
  failCompaction(
    jobId: string,
    claimId: string,
    error: string,
    retryAt: Date | null,
    actor: Actor,
  ): Promise<{ current: boolean; terminal: boolean; articleId: string; version: number } | null>;
  findPotentialConflicts(
    brainId: string,
    articleId: string | undefined,
    title: string,
    summary: string,
    actor: Actor,
  ): Promise<StagedWriteRecord["potentialConflicts"]>;
  search(
    input: SearchArticlesInput,
    actor: Actor,
    embedding: { model: string; vector: number[] } | null,
  ): Promise<SearchHit[]>;
  setEmbedding(
    articleId: string,
    version: number,
    ordinal: number,
    vector: number[],
    model: string,
    actor: Actor,
  ): Promise<void>;
  clearEmbeddings(articleId: string, version: number, actor: Actor): Promise<void>;
  createTask(input: CreateTaskInput, actor: Actor): Promise<Task>;
  listTasks(
    brainId: string,
    actor: Actor,
    page?: { limit: number; offset: number },
  ): Promise<Task[]>;
  getTask(id: string, actor: Actor): Promise<Task | null>;
  claimTask(
    brainId: string,
    taskId: string | undefined,
    actor: Actor,
    leaseSeconds: number,
  ): Promise<Task | null>;
  heartbeatTask(taskId: string, actor: Actor, leaseSeconds: number): Promise<Task>;
  releaseTask(taskId: string, actor: Actor, force: boolean): Promise<Task>;
  updateTask(
    taskId: string,
    actor: Actor,
    patch: Partial<Pick<Task, "status" | "title" | "brief" | "priority">>,
  ): Promise<Task>;
  addTaskComment(taskId: string, actor: Actor, body: string): Promise<void>;
  listTaskComments(
    taskId: string,
    actor: Actor,
  ): Promise<
    Array<{ id: string; body: string; actorId: string; clientId: string | null; createdAt: string }>
  >;
  attachTaskLink(taskId: string, url: string, label: string | null, actor: Actor): Promise<void>;
  linkTaskArticle(taskId: string, articleId: string, actor: Actor): Promise<void>;
  scanMaintenance(brainId: string, actor: Actor): Promise<MaintenanceCandidate[]>;
  listMaintenance(
    brainId: string,
    actor: Actor,
    page?: { limit: number; offset: number },
  ): Promise<MaintenanceCandidate[]>;
  getMaintenanceCandidate(candidateId: string, actor: Actor): Promise<MaintenanceCandidate | null>;
  updateMaintenance(
    candidateId: string,
    status: "resolved" | "dismissed",
    actor: Actor,
  ): Promise<MaintenanceCandidate>;
  recentActivity(
    brainId: string,
    actor: Actor,
    limit: number,
    source?: "mcp",
    offset?: number,
  ): Promise<
    Array<{
      id: string;
      action: string;
      resource: string;
      actorId: string;
      clientId: string | null;
      detail: Record<string, unknown>;
      createdAt: string;
    }>
  >;
  recordMcpToolCall(input: McpToolCallInput, actor: Actor): Promise<void>;
  getMcpAnalytics(
    workspaceId: string,
    range: McpAnalyticsRange,
    actor: Actor,
    brainId?: string,
  ): Promise<McpAnalytics>;
  /** Instance-wide; the store refuses an actor that is not a system owner. */
  getInstanceOverview(actor: Actor): Promise<InstanceOverview>;
  listInstanceUsers(input: ListInstanceUsersInput, actor: Actor): Promise<InstanceUsersPage>;
  createInvitation(
    brainId: string,
    email: string,
    role: BrainRole,
    tokenHash: string | null,
    expiresAt: Date,
    actor: Actor,
    proposedByClient?: string | null,
  ): Promise<{ id: string; expiresAt: Date }>;
  listBrainInvitations(brainId: string, actor: Actor): Promise<BrainInvitation[]>;
  getBrainInvitation(invitationId: string, actor: Actor): Promise<BrainInvitation | null>;
  approveInvitation(
    invitationId: string,
    tokenHash: string,
    expiresAt: Date,
    actor: Actor,
  ): Promise<BrainInvitation>;
  revokeInvitation(invitationId: string, actor: Actor): Promise<BrainInvitation>;
  audit(
    actor: Actor,
    action: string,
    resource: string,
    detail?: Record<string, unknown>,
  ): Promise<void>;
}

// The model name travels with the vectors it produced: vectors are only comparable inside
// one model's space, so the store needs to know which space each row and each query belongs to.
export interface EmbeddingClient {
  embedQuery(value: string): Promise<{ model: string; vector: number[] }>;
  embedPassages(values: string[]): Promise<{ model: string; vectors: number[][] }>;
  healthy(): Promise<boolean>;
}

export interface BlobStore {
  put(path: string, body: Buffer): Promise<void>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
}

export interface BrainWithIndex {
  brain: Omit<BrainRecord, "wrappedKey">;
  routingIndex: ArticleSummary[];
  articleTotal: number;
  role: BrainRole;
}

export interface ReadArticleResult extends Article {}
