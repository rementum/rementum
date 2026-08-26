import type {
  Article,
  ArticleSummary,
  BrainRole,
  CompactionState,
  CreateBrainInput,
  CreateTaskInput,
  MaintenanceCandidate,
  PromoteWriteInput,
  SearchArticlesInput,
  SourceInput,
  StageWriteInput,
  Task,
  TeamRole,
} from "@rementum/contracts";
import type { CipherEnvelope, WrappedKey } from "./crypto.js";

export interface Actor {
  userId: string;
  clientId: string | null;
  teamRoles: Map<string, TeamRole>;
  workspaceRoles: Map<string, TeamRole>;
  brainRoles: Map<string, BrainRole>;
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

export interface DataStore {
  createTeam(
    name: string,
    slug: string,
    actor: Actor,
    teamId: string,
    workspaceId: string,
  ): Promise<{ team: TeamRecord; workspace: WorkspaceRecord }>;
  listTeams(actor: Actor): Promise<TeamRecord[]>;
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
  listBrains(actor: Actor, workspaceId?: string): Promise<BrainRecord[]>;
  getBrain(id: string, actor: Actor): Promise<BrainRecord | null>;
  isBrainCompactionEnabled(brainId: string, actor: Actor): Promise<boolean>;
  listRoutingIndex(brainId: string, actor: Actor, limit: number): Promise<ArticleRecord[]>;
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
  listArticleVersions(articleId: string, actor: Actor): Promise<VersionRecord[]>;
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
  promoteStagedWrite(
    input: PromoteWriteInput,
    actor: Actor,
    llmAvailable: boolean,
  ): Promise<{ write: StagedWriteRecord; article: ArticleRecord; version: VersionRecord }>;
  queueWorkspaceCurrentCompactions(workspaceId: string, actor: Actor): Promise<number>;
  queueArticleCompaction(articleId: string, actor: Actor): Promise<ArticleRecord>;
  cancelWorkspaceCompactions(workspaceId: string, actor: Actor): Promise<string[]>;
  getCompactionJob(jobId: string, actor: Actor): Promise<CompactionJobRecord | null>;
  completeCompaction(
    jobId: string,
    claimId: string,
    generated: GeneratedArticle,
    encrypted: CipherEnvelope,
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
    embedding: number[] | null,
  ): Promise<SearchHit[]>;
  setEmbedding(
    articleId: string,
    version: number,
    ordinal: number,
    vector: number[],
    actor: Actor,
  ): Promise<void>;
  clearEmbeddings(articleId: string, version: number, actor: Actor): Promise<void>;
  createTask(input: CreateTaskInput, actor: Actor): Promise<Task>;
  listTasks(brainId: string, actor: Actor): Promise<Task[]>;
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
  listMaintenance(brainId: string, actor: Actor): Promise<MaintenanceCandidate[]>;
  updateMaintenance(
    candidateId: string,
    status: "resolved" | "dismissed",
    actor: Actor,
  ): Promise<MaintenanceCandidate>;
  recentActivity(
    brainId: string,
    actor: Actor,
    limit: number,
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
  createInvitation(
    brainId: string,
    email: string,
    role: BrainRole,
    tokenHash: string,
    expiresAt: Date,
    actor: Actor,
  ): Promise<{ id: string; expiresAt: Date }>;
  audit(
    actor: Actor,
    action: string,
    resource: string,
    detail?: Record<string, unknown>,
  ): Promise<void>;
}

export interface EmbeddingClient {
  embedQuery(value: string): Promise<number[]>;
  embedPassages(values: string[]): Promise<number[][]>;
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
}

export interface ReadArticleResult extends Article {}
