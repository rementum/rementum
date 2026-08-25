import { randomBytes, randomUUID } from "node:crypto";
import type {
  CreateBrainInput,
  CreateTaskInput,
  CreateTeamInput,
  PromoteWriteInput,
  SearchArticlesInput,
  StageWriteInput,
  Task,
} from "@rementum/contracts";
import {
  type CipherEnvelope,
  contentAad,
  decrypt,
  encrypt,
  generateDataKey,
  hashContent,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto.js";
import { ConflictError, ForbiddenError, NotFoundError, SummaryGenerationError } from "./errors.js";
import { LocalSummaryGenerator } from "./local-summary.js";
import { slugify, splitMarkdownByHeading } from "./markdown.js";
import type {
  Actor,
  BrainWithIndex,
  DataStore,
  EmbeddingClient,
  ReadArticleResult,
  ResolvedStageWriteInput,
  SearchHit,
  StagedWriteRecord,
  SummaryGenerator,
} from "./types.js";

export class RementumService {
  constructor(
    private readonly store: DataStore,
    private readonly embeddings: EmbeddingClient,
    private readonly masterKey: Buffer,
    private readonly summaries: SummaryGenerator = new LocalSummaryGenerator(),
  ) {}

  async createTeam(input: CreateTeamInput, actor: Actor) {
    const teamId = randomUUID();
    const base = slugify(input.name) || "team";
    const slug = `${base.slice(0, 105)}-${randomBytes(6).toString("hex")}`;
    const team = await this.store.createTeam(input.name.trim(), slug, actor, teamId);
    await this.store.audit(actor, "team.created", `team:${team.id}`);
    return { ...team, createdAt: team.createdAt.toISOString() };
  }

  async listTeams(actor: Actor) {
    return (await this.store.listTeams(actor)).map((team) => ({
      ...team,
      createdAt: team.createdAt.toISOString(),
    }));
  }

  async listTeamMembers(teamId: string, actor: Actor) {
    requireWorkspaceRole(actor, teamId, ["owner", "admin", "member"]);
    return (await this.store.listTeamMembers(teamId, actor)).map((member) => ({
      ...member,
      createdAt: member.createdAt.toISOString(),
    }));
  }

  async listTeamInvitations(teamId: string, actor: Actor) {
    requireWorkspaceRole(actor, teamId, ["owner", "admin"]);
    return (await this.store.listTeamInvitations(teamId, actor)).map(serializeTeamInvitation);
  }

  async proposeTeamInvite(teamId: string, email: string, role: "admin" | "member", actor: Actor) {
    const actorRole = actor.workspaceRoles.get(teamId);
    requireWorkspaceRole(actor, teamId, ["owner", "admin"]);
    if (role === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the team owner can invite an admin");
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await this.store.createTeamInvitation(
      teamId,
      email.trim().toLowerCase(),
      role,
      hashContent(token),
      expiresAt,
      actor,
    );
    await this.store.audit(actor, "team_invitation.created", `team:${teamId}`, {
      invitationId: invitation.id,
      role,
    });
    return { ...serializeTeamInvitation(invitation), token };
  }

  async resendTeamInvite(invitationId: string, actor: Actor) {
    const teams = await this.store.listTeams(actor);
    const pending = (
      await Promise.all(teams.map((team) => this.store.listTeamInvitations(team.id, actor)))
    ).flat();
    const previous = pending.find((invitation) => invitation.id === invitationId);
    if (!previous) throw new NotFoundError("Pending team invitation");
    const actorRole = actor.workspaceRoles.get(previous.workspaceId);
    if (previous.role === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the team owner can resend an admin invitation");
    }
    await this.store.revokeTeamInvitation(invitationId, actor);
    return this.proposeTeamInvite(previous.workspaceId, previous.email, previous.role, actor);
  }

  async revokeTeamInvite(invitationId: string, actor: Actor) {
    const teams = await this.store.listTeams(actor);
    const pending = (
      await Promise.all(teams.map((team) => this.store.listTeamInvitations(team.id, actor)))
    ).flat();
    const invitation = pending.find((candidate) => candidate.id === invitationId);
    if (!invitation) throw new NotFoundError("Pending team invitation");
    const actorRole = actor.workspaceRoles.get(invitation.workspaceId);
    if (invitation.role === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the team owner can revoke an admin invitation");
    }
    await this.store.revokeTeamInvitation(invitationId, actor);
    await this.store.audit(actor, "team_invitation.revoked", `team:${invitation.workspaceId}`, {
      invitationId,
    });
  }

  async updateTeamMemberRole(
    teamId: string,
    userId: string,
    role: "admin" | "member",
    actor: Actor,
  ) {
    requireWorkspaceRole(actor, teamId, ["owner"]);
    const member = await this.store.updateTeamMemberRole(teamId, userId, role, actor);
    await this.store.audit(actor, "team_member.role_changed", `team:${teamId}`, {
      userId,
      role,
    });
    return { ...member, createdAt: member.createdAt.toISOString() };
  }

  async removeTeamMember(teamId: string, userId: string, actor: Actor) {
    const actorRole = actor.workspaceRoles.get(teamId);
    requireWorkspaceRole(actor, teamId, ["owner", "admin"]);
    const members = await this.store.listTeamMembers(teamId, actor);
    const target = members.find((member) => member.userId === userId);
    if (!target) throw new NotFoundError("Team member");
    if (target.role === "owner") throw new ForbiddenError("The team owner cannot be removed");
    if (actorRole === "admin" && target.role !== "member") {
      throw new ForbiddenError("Admins can only remove ordinary members");
    }
    await this.store.removeTeamMember(teamId, userId, actor);
    await this.store.audit(actor, "team_member.removed", `team:${teamId}`, { userId });
  }

  async createBrain(input: CreateBrainInput, actor: Actor): Promise<BrainWithIndex> {
    const workspaceId = resolveWorkspaceId(input.workspaceId, actor);
    const resolvedInput = { ...input, workspaceId };
    requireWorkspaceRole(actor, workspaceId, ["owner", "admin", "member"]);
    const brainId = randomUUID();
    const record = await this.store.createBrain(
      resolvedInput,
      actor,
      wrapDataKey(generateDataKey(), this.masterKey, brainId),
      brainId,
    );
    await this.store.audit(actor, "brain.created", `brain:${record.id}`);
    return { brain: withoutWrappedKey(record), routingIndex: [] };
  }

  async listBrains(actor: Actor, workspaceId?: string) {
    if (workspaceId) requireWorkspaceRole(actor, workspaceId, ["owner", "admin", "member"]);
    const brains = await this.store.listBrains(actor, workspaceId);
    return brains.map(withoutWrappedKey);
  }

  async getBrain(brainId: string, actor: Actor, limit = 200): Promise<BrainWithIndex> {
    requireBrainRole(actor, brainId, ["owner", "editor", "commenter", "viewer"]);
    const brain = await this.store.getBrain(brainId, actor);
    if (!brain) throw new NotFoundError("Brain");
    const articles = await this.store.listRoutingIndex(brainId, actor, limit);
    await this.store.audit(actor, "brain.read", `brain:${brainId}`, {
      articleCount: articles.length,
    });
    return {
      brain: withoutWrappedKey(brain),
      routingIndex: articles.map(toSummary),
    };
  }

  async readArticle(articleId: string, actor: Actor): Promise<ReadArticleResult> {
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor", "commenter", "viewer"]);
    const [brain, version, links] = await Promise.all([
      this.store.getBrain(article.brainId, actor),
      this.store.getCurrentVersion(articleId, actor),
      this.store.getArticleLinks(articleId, actor),
    ]);
    if (!brain || !version) throw new NotFoundError("Article version");
    const sources = await this.store.getArticleSources(articleId, version.version, actor);
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const body = decrypt(version.body, key, version.bodyAad).toString("utf8");
    await this.store.audit(actor, "article.read", `article:${articleId}`, {
      version: version.version,
    });
    return {
      ...toSummary(article),
      body,
      links,
      sources,
      verifiedAt: article.verifiedAt?.toISOString() ?? null,
      reviewAfter: article.reviewAfter?.toISOString() ?? null,
      provenance: {
        actorId: version.actorId,
        clientId: version.clientId,
        changeSummary: version.changeSummary,
        createdAt: version.createdAt.toISOString(),
      },
    };
  }

  async stageWrite(input: StageWriteInput, actor: Actor): Promise<StagedWriteRecord> {
    requireBrainRole(actor, input.brainId, ["owner", "editor"]);
    const brain = await this.store.getBrain(input.brainId, actor);
    if (!brain) throw new NotFoundError("Brain");
    if (input.idempotencyKey) {
      const existing = await this.store.getStagedWriteByIdempotencyKey(input.idempotencyKey, actor);
      if (existing) return existing;
    }
    const articleId = input.articleId ?? randomUUID();
    const writeId = randomUUID();
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const bodyAad = `brain:${brain.id}:article:${articleId}:write:${writeId}`;
    const bodyText =
      input.operation === "append"
        ? `${(await this.readArticle(articleId, actor)).body.trimEnd()}\n\n${input.body.trimStart()}`
        : input.body;
    let summary: string;
    try {
      summary = await this.summaries.generateSummary({ title: input.title, body: bodyText });
    } catch (error) {
      if (error instanceof SummaryGenerationError) throw error;
      throw new SummaryGenerationError();
    }
    const resolvedInput: ResolvedStageWriteInput = { ...input, summary };
    const body = encrypt(bodyText, key, bodyAad);
    const potentialConflicts = await this.store.findPotentialConflicts(
      input.brainId,
      input.articleId,
      input.title,
      summary,
      actor,
    );
    if (potentialConflicts.length && !input.acknowledgePotentialConflicts) {
      throw new ConflictError("Potentially conflicting articles must be acknowledged", {
        potentialConflicts,
      });
    }
    const write = await this.store.createStagedWrite(
      resolvedInput,
      actor,
      articleId,
      writeId,
      body,
      bodyAad,
      hashContent(bodyText),
      potentialConflicts,
    );
    await this.store.audit(actor, "write.staged", `write:${write.id}`, {
      operation: input.operation,
      slug: input.slug,
    });
    return write;
  }

  async promoteWrite(input: PromoteWriteInput, actor: Actor) {
    const write = await this.store.getStagedWrite(input.writeId, actor);
    if (!write) throw new NotFoundError("Staged write");
    requireBrainRole(actor, write.brainId, ["owner", "editor"]);
    if (input.decision === "override" && write.stagedBy === actor.userId) {
      throw new ForbiddenError("The staging actor cannot approve their own override");
    }
    const result = await this.store.promoteStagedWrite(input, actor);
    await this.store.audit(actor, "write.promoted", `write:${write.id}`, {
      version: result.version.version,
      decision: input.decision,
    });
    void this.indexPromotedArticle(result.article.id, actor).catch(() => undefined);
    return result;
  }

  async withdrawWrite(writeId: string, actor: Actor) {
    const write = await this.store.getStagedWrite(writeId, actor);
    if (!write) throw new NotFoundError("Staged write");
    requireBrainRole(actor, write.brainId, ["owner", "editor"]);
    if (write.stagedBy !== actor.userId && actor.brainRoles.get(write.brainId) !== "owner") {
      throw new ForbiddenError("Only the staging actor or brain owner can withdraw this write");
    }
    const updated = await this.store.withdrawStagedWrite(writeId, actor);
    await this.store.audit(actor, "write.withdrawn", `write:${writeId}`);
    return updated;
  }

  async search(input: SearchArticlesInput, actor: Actor): Promise<SearchHit[]> {
    requireBrainRole(actor, input.brainId, ["owner", "editor", "commenter", "viewer"]);
    let embedding: number[] | null = null;
    try {
      embedding = await this.embeddings.embedQuery(input.query);
    } catch {
      // Metadata FTS remains a supported degraded mode.
    }
    const hits = await this.store.search(input, actor, embedding);
    await this.store.audit(actor, "article.search", `brain:${input.brainId}`, {
      queryHash: hashContent(input.query),
      hits: hits.length,
      semantic: embedding !== null,
    });
    return hits;
  }

  async getWriteStatus(writeId: string, actor: Actor) {
    const write = await this.store.getStagedWrite(writeId, actor);
    if (!write) throw new NotFoundError("Staged write");
    requireBrainRole(actor, write.brainId, ["owner", "editor", "commenter", "viewer"]);
    return write;
  }

  async listStagedWrites(
    brainId: string,
    status: "pending" | "promoted" | "conflicted" | "withdrawn" | undefined,
    actor: Actor,
  ) {
    requireBrainRole(actor, brainId, ["owner", "editor", "commenter", "viewer"]);
    return this.store.listStagedWrites(brainId, actor, status);
  }

  async reviewStagedWrite(writeId: string, actor: Actor) {
    const write = await this.getWriteStatus(writeId, actor);
    requireBrainRole(actor, write.brainId, ["owner", "editor"]);
    const brain = await this.store.getBrain(write.brainId, actor);
    if (!brain) throw new NotFoundError("Brain");
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const candidateBody = decrypt(write.body, key, write.bodyAad).toString("utf8");
    const currentBody =
      write.operation === "create"
        ? null
        : (await this.readArticle(write.articleId ?? "", actor)).body;
    return { write, currentBody, candidateBody };
  }

  async listArticleHistory(articleId: string, actor: Actor) {
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor", "commenter", "viewer"]);
    return this.store.listArticleVersions(articleId, actor);
  }

  async verifyArticle(articleId: string, reviewAfter: Date | null, actor: Actor) {
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor"]);
    const verified = await this.store.verifyArticle(articleId, reviewAfter, actor);
    await this.store.audit(actor, "article.verified", `article:${articleId}`, {
      reviewAfter: reviewAfter?.toISOString() ?? null,
    });
    return verified;
  }

  async setArticleLinks(
    articleId: string,
    links: Array<{ toArticleId: string; relation: string }>,
    actor: Actor,
  ) {
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor"]);
    await this.store.setArticleLinks(articleId, links, actor);
    await this.store.audit(actor, "article.links_set", `article:${articleId}`, {
      count: links.length,
    });
    return { ok: true };
  }

  async listTasks(brainId: string, actor: Actor) {
    requireBrainRole(actor, brainId, ["owner", "editor", "commenter", "viewer"]);
    return this.store.listTasks(brainId, actor);
  }

  async getTask(taskId: string, actor: Actor) {
    const task = await this.store.getTask(taskId, actor);
    if (!task) throw new NotFoundError("Task");
    requireBrainRole(actor, task.brainId, ["owner", "editor", "commenter", "viewer"]);
    return task;
  }

  async listTaskComments(taskId: string, actor: Actor) {
    await this.getTask(taskId, actor);
    return this.store.listTaskComments(taskId, actor);
  }

  async createTask(input: CreateTaskInput, actor: Actor): Promise<Task> {
    requireBrainRole(actor, input.brainId, ["owner", "editor"]);
    const task = await this.store.createTask(input, actor);
    await this.store.audit(actor, "task.created", `task:${task.id}`);
    return task;
  }

  async claimTask(brainId: string, taskId: string | undefined, leaseSeconds: number, actor: Actor) {
    requireBrainRole(actor, brainId, ["owner", "editor"]);
    const task = await this.store.claimTask(brainId, taskId, actor, leaseSeconds);
    if (task) await this.store.audit(actor, "task.claimed", `task:${task.id}`);
    return task;
  }

  async heartbeatTask(taskId: string, leaseSeconds: number, actor: Actor) {
    const task = await this.store.heartbeatTask(taskId, actor, leaseSeconds);
    await this.store.audit(actor, "task.heartbeat", `task:${task.id}`);
    return task;
  }

  async releaseTask(taskId: string, force: boolean, actor: Actor) {
    const task = await this.store.getTask(taskId, actor);
    if (!task) throw new NotFoundError("Task");
    requireBrainRole(actor, task.brainId, force ? ["owner"] : ["owner", "editor"]);
    const released = await this.store.releaseTask(taskId, actor, force);
    await this.store.audit(
      actor,
      force ? "task.force_released" : "task.released",
      `task:${task.id}`,
    );
    return released;
  }

  async updateTask(
    taskId: string,
    patch: Partial<Pick<Task, "status" | "title" | "brief" | "priority">>,
    actor: Actor,
  ) {
    const task = await this.getTask(taskId, actor);
    requireBrainRole(actor, task.brainId, ["owner", "editor"]);
    const updated = await this.store.updateTask(taskId, actor, patch);
    await this.store.audit(actor, "task.updated", `task:${taskId}`, { fields: Object.keys(patch) });
    return updated;
  }

  async commentTask(taskId: string, body: string, actor: Actor) {
    const task = await this.getTask(taskId, actor);
    requireBrainRole(actor, task.brainId, ["owner", "editor", "commenter"]);
    await this.store.addTaskComment(taskId, actor, body);
    await this.store.audit(actor, "task.commented", `task:${taskId}`);
    return { ok: true };
  }

  async attachTaskLink(taskId: string, url: string, label: string | null, actor: Actor) {
    const task = await this.getTask(taskId, actor);
    requireBrainRole(actor, task.brainId, ["owner", "editor"]);
    await this.store.attachTaskLink(taskId, url, label, actor);
    await this.store.audit(actor, "task.link_attached", `task:${taskId}`, { url });
    return { ok: true };
  }

  async linkTaskArticle(taskId: string, articleId: string, actor: Actor) {
    const task = await this.getTask(taskId, actor);
    requireBrainRole(actor, task.brainId, ["owner", "editor"]);
    await this.store.linkTaskArticle(taskId, articleId, actor);
    await this.store.audit(actor, "task.article_linked", `task:${taskId}`, { articleId });
    return { ok: true };
  }

  async scanMaintenance(brainId: string, actor: Actor) {
    requireBrainRole(actor, brainId, ["owner", "editor"]);
    const candidates = await this.store.scanMaintenance(brainId, actor);
    await this.store.audit(actor, "maintenance.scanned", `brain:${brainId}`, {
      candidates: candidates.length,
    });
    return candidates;
  }

  async listMaintenance(brainId: string, actor: Actor) {
    requireBrainRole(actor, brainId, ["owner", "editor"]);
    return this.store.listMaintenance(brainId, actor);
  }

  async updateMaintenance(candidateId: string, status: "resolved" | "dismissed", actor: Actor) {
    const candidate = await this.store.updateMaintenance(candidateId, status, actor);
    requireBrainRole(actor, candidate.brainId, ["owner", "editor"]);
    await this.store.audit(actor, `maintenance.${status}`, `brain:${candidate.brainId}`, {
      candidateId,
    });
    return candidate;
  }

  async recentActivity(brainId: string, limit: number, actor: Actor) {
    requireBrainRole(actor, brainId, ["owner", "editor", "commenter", "viewer"]);
    return this.store.recentActivity(brainId, actor, limit);
  }

  async reindexArticle(articleId: string, actor: Actor) {
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor"]);
    await this.indexPromotedArticle(articleId, actor);
    return { ok: true, articleId, version: article.currentVersion };
  }

  async proposeInvite(
    brainId: string,
    email: string,
    role: "editor" | "commenter" | "viewer",
    actor: Actor,
  ) {
    requireBrainRole(actor, brainId, ["owner"]);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await this.store.createInvitation(
      brainId,
      email.trim().toLowerCase(),
      role,
      hashContent(token),
      expiresAt,
      actor,
    );
    await this.store.audit(actor, "invitation.created", `brain:${brainId}`, {
      invitationId: invitation.id,
      role,
    });
    return { ...invitation, expiresAt: expiresAt.toISOString(), token };
  }

  private async indexPromotedArticle(articleId: string, actor: Actor): Promise<void> {
    const article = await this.readArticle(articleId, actor);
    const vectors = await this.embeddings.embedPassages(
      splitMarkdownByHeading(article.body).map(
        (section) => `passage: ${article.title}\n${article.summary}\n${section.text}`,
      ),
    );
    await Promise.all(
      vectors.map((vector, ordinal) =>
        this.store.setEmbedding(articleId, article.currentVersion, ordinal, vector, actor),
      ),
    );
  }
}

export function requireBrainRole(actor: Actor, brainId: string, allowed: string[]): void {
  const role = actor.brainRoles.get(brainId);
  if (!role || !allowed.includes(role)) throw new ForbiddenError();
}

export function requireWorkspaceRole(actor: Actor, workspaceId: string, allowed: string[]): void {
  const role = actor.workspaceRoles.get(workspaceId);
  if (!role || !allowed.includes(role)) throw new ForbiddenError();
}

export function resolveWorkspaceId(workspaceId: string | undefined, actor: Actor): string {
  if (workspaceId) return workspaceId;
  const workspaceIds = [...actor.workspaceRoles.keys()];
  if (workspaceIds.length === 1) return workspaceIds[0] as string;
  if (workspaceIds.length === 0) {
    throw new ForbiddenError("No accessible workspace is available for a new brain");
  }
  throw new ConflictError("workspaceId is required when more than one workspace is accessible", {
    workspaceIds,
  });
}

function withoutWrappedKey<T extends { wrappedKey: unknown }>(record: T): Omit<T, "wrappedKey"> {
  const { wrappedKey: _wrappedKey, ...rest } = record;
  return rest;
}

function serializeTeamInvitation(invitation: {
  id: string;
  workspaceId: string;
  email: string;
  role: "admin" | "member";
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    ...invitation,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

function toSummary(record: {
  id: string;
  brainId: string;
  slug: string;
  title: string;
  summary: string;
  keywords: string[];
  kind: "canonical" | "log";
  freshness: "current" | "review_due" | "stale" | "unknown";
  currentVersion: number;
  updatedAt: Date | string;
}) {
  return {
    id: record.id,
    brainId: record.brainId,
    slug: record.slug,
    title: record.title,
    summary: record.summary,
    keywords: record.keywords,
    kind: record.kind,
    freshness: record.freshness,
    currentVersion: record.currentVersion,
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt : record.updatedAt.toISOString(),
  };
}

export function stagedBodyAad(write: StagedWriteRecord): string {
  return write.bodyAad;
}

export function reencryptStagedBody(
  write: StagedWriteRecord,
  brainKey: Buffer,
  targetArticleId: string,
  targetVersion: number,
): CipherEnvelope {
  const plaintext = decrypt(write.body, brainKey, stagedBodyAad(write));
  return encrypt(plaintext, brainKey, contentAad(write.brainId, targetArticleId, targetVersion));
}
