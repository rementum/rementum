import { randomBytes, randomUUID } from "node:crypto";
import type {
  BrainListSort,
  CreateBrainInput,
  CreateTaskInput,
  CreateTeamInput,
  CreateWorkspaceInput,
  PromoteWriteInput,
  RoutingIndexSort,
  SearchArticlesInput,
  SearchBrainsInput,
  StageWriteInput,
  Task,
  UpdateWorkspaceInput,
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
import {
  ArticleGenerationError,
  ConflictError,
  ForbiddenError,
  LlmUnavailableError,
  NotFoundError,
} from "./errors.js";
import { LocalArticleGenerator } from "./local-summary.js";
import { extractWikiLinks, slugify, splitMarkdownByHeading } from "./markdown.js";
import { rankBrains } from "./search.js";
import type {
  Actor,
  ArticleGenerator,
  ArticleRecord,
  BrainWithIndex,
  ClaimedCompactionJob,
  DataStore,
  EmbeddingClient,
  ReadArticleResult,
  ResolvedStageWriteInput,
  SearchHit,
  StagedWriteRecord,
} from "./types.js";

export class RementumService {
  private readonly localArticleGenerator = new LocalArticleGenerator();

  constructor(
    private readonly store: DataStore,
    private readonly embeddings: EmbeddingClient,
    private readonly masterKey: Buffer,
    private readonly compactionGenerator: ArticleGenerator | null = null,
    private readonly llmAvailable = false,
  ) {}

  async createTeam(input: CreateTeamInput, actor: Actor) {
    const teamId = randomUUID();
    const workspaceId = randomUUID();
    const base = slugify(input.name) || "team";
    const slug = `${base.slice(0, 105)}-${randomBytes(6).toString("hex")}`;
    const { team, workspace } = await this.store.createTeam(
      input.name.trim(),
      slug,
      actor,
      teamId,
      workspaceId,
    );
    await this.store.audit(actor, "team.created", `team:${team.id}`, {
      defaultWorkspaceId: workspace.id,
    });
    return {
      ...team,
      defaultWorkspaceId: workspace.id,
      createdAt: team.createdAt.toISOString(),
    };
  }

  async listTeams(actor: Actor) {
    return (await this.store.listTeams(actor)).map((team) => ({
      ...team,
      createdAt: team.createdAt.toISOString(),
    }));
  }

  async createWorkspace(teamId: string, input: CreateWorkspaceInput, actor: Actor) {
    requireTeamRole(actor, teamId, ["owner", "admin"]);
    const workspaceId = randomUUID();
    const base = slugify(input.name) || "workspace";
    const slug = `${base.slice(0, 105)}-${randomBytes(6).toString("hex")}`;
    const workspace = await this.store.createWorkspace(
      teamId,
      input.name.trim(),
      slug,
      actor,
      workspaceId,
    );
    await this.store.audit(actor, "workspace.created", `workspace:${workspace.id}`);
    return { ...workspace, createdAt: workspace.createdAt.toISOString() };
  }

  async listWorkspaces(actor: Actor, teamId?: string) {
    if (teamId) requireTeamRole(actor, teamId, ["owner", "admin", "member"]);
    return (await this.store.listWorkspaces(actor, teamId)).map((workspace) => ({
      ...workspace,
      createdAt: workspace.createdAt.toISOString(),
    }));
  }

  async updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput, actor: Actor) {
    requireWorkspaceRole(actor, workspaceId, ["owner", "admin"]);
    if (input.llmCompactionEnabled === true && !this.llmAvailable) {
      throw new LlmUnavailableError();
    }
    const patch: { name?: string; slug?: string; llmCompactionEnabled?: boolean } = {};
    if (input.name !== undefined) {
      const base = slugify(input.name) || "workspace";
      patch.name = input.name.trim();
      patch.slug = `${base.slice(0, 105)}-${randomBytes(6).toString("hex")}`;
    }
    if (input.llmCompactionEnabled !== undefined) {
      patch.llmCompactionEnabled = input.llmCompactionEnabled;
    }
    const workspace = await this.store.updateWorkspace(workspaceId, patch, actor);
    if (input.llmCompactionEnabled === false) {
      const articleIds = await this.store.cancelWorkspaceCompactions(workspaceId, actor);
      for (const articleId of articleIds) {
        void this.indexPromotedArticle(articleId, actor).catch(() => undefined);
      }
    }
    await this.store.audit(actor, "workspace.updated", `workspace:${workspace.id}`, {
      llmCompactionEnabled: workspace.llmCompactionEnabled,
    });
    return { ...workspace, createdAt: workspace.createdAt.toISOString() };
  }

  async queueWorkspaceCompactions(workspaceId: string, actor: Actor) {
    requireWorkspaceRole(actor, workspaceId, ["owner", "admin"]);
    if (!this.llmAvailable) throw new LlmUnavailableError();
    const workspace = await this.store.getWorkspace(workspaceId, actor);
    if (!workspace) throw new NotFoundError("Workspace");
    if (!workspace.llmCompactionEnabled) {
      throw new ConflictError("LLM compaction is disabled for this workspace");
    }
    const queued = await this.store.queueWorkspaceCurrentCompactions(workspaceId, actor);
    await this.store.audit(actor, "workspace.compactions_queued", `workspace:${workspaceId}`, {
      queued,
    });
    return { queued };
  }

  async deleteWorkspace(workspaceId: string, confirmation: string, actor: Actor) {
    requireWorkspaceRole(actor, workspaceId, ["owner"]);
    const workspace = await this.store.deleteWorkspace(workspaceId, confirmation, actor);
    await this.store.audit(actor, "workspace.deleted", `team:${workspace.teamId}`, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });
  }

  async listTeamMembers(teamId: string, actor: Actor) {
    requireTeamRole(actor, teamId, ["owner", "admin", "member"]);
    return (await this.store.listTeamMembers(teamId, actor)).map((member) => ({
      ...member,
      createdAt: member.createdAt.toISOString(),
    }));
  }

  async listTeamInvitations(teamId: string, actor: Actor) {
    requireTeamRole(actor, teamId, ["owner", "admin"]);
    return (await this.store.listTeamInvitations(teamId, actor)).map(serializeTeamInvitation);
  }

  async proposeTeamInvite(teamId: string, email: string, role: "admin" | "member", actor: Actor) {
    const actorRole = actor.teamRoles.get(teamId);
    requireTeamRole(actor, teamId, ["owner", "admin"]);
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
    const actorRole = actor.teamRoles.get(previous.teamId);
    if (previous.role === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the team owner can resend an admin invitation");
    }
    await this.store.revokeTeamInvitation(invitationId, actor);
    return this.proposeTeamInvite(previous.teamId, previous.email, previous.role, actor);
  }

  async revokeTeamInvite(invitationId: string, actor: Actor) {
    const teams = await this.store.listTeams(actor);
    const pending = (
      await Promise.all(teams.map((team) => this.store.listTeamInvitations(team.id, actor)))
    ).flat();
    const invitation = pending.find((candidate) => candidate.id === invitationId);
    if (!invitation) throw new NotFoundError("Pending team invitation");
    const actorRole = actor.teamRoles.get(invitation.teamId);
    if (invitation.role === "admin" && actorRole !== "owner") {
      throw new ForbiddenError("Only the team owner can revoke an admin invitation");
    }
    await this.store.revokeTeamInvitation(invitationId, actor);
    await this.store.audit(actor, "team_invitation.revoked", `team:${invitation.teamId}`, {
      invitationId,
    });
  }

  async updateTeamMemberRole(
    teamId: string,
    userId: string,
    role: "admin" | "member",
    actor: Actor,
  ) {
    requireTeamRole(actor, teamId, ["owner"]);
    const member = await this.store.updateTeamMemberRole(teamId, userId, role, actor);
    await this.store.audit(actor, "team_member.role_changed", `team:${teamId}`, {
      userId,
      role,
    });
    return { ...member, createdAt: member.createdAt.toISOString() };
  }

  async removeTeamMember(teamId: string, userId: string, actor: Actor) {
    const actorRole = actor.teamRoles.get(teamId);
    requireTeamRole(actor, teamId, ["owner", "admin"]);
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

  async deleteTeam(teamId: string, confirmation: string, actor: Actor) {
    requireTeamRole(actor, teamId, ["owner"]);
    const team = await this.store.deleteTeam(teamId, confirmation, actor);
    // The team row is gone, so a `team:` resource would violate the audit foreign key;
    // the event attaches to the actor instead and stays visible to them.
    await this.store.audit(actor, "team.deleted", `user:${actor.userId}`, {
      teamId,
      teamName: team.name,
    });
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
    return {
      brain: withoutWrappedKey(record),
      routingIndex: [],
      articleTotal: 0,
      role: "owner" as const,
    };
  }

  async listBrains(
    actor: Actor,
    options: {
      workspaceId?: string;
      shared?: boolean;
      sort?: BrainListSort;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { workspaceId, shared, sort, limit, offset } = options;
    if (workspaceId) requireWorkspaceRole(actor, workspaceId, ["owner", "admin", "member"]);
    const { items, total } = await this.store.listBrains(actor, {
      ...(workspaceId ? { workspaceId } : {}),
      // "Shared" means readable through a brain role while outside every workspace the
      // actor belongs to; an empty membership list therefore marks all brains shared.
      ...(shared ? { excludeWorkspaceIds: [...actor.workspaceRoles.keys()] } : {}),
      ...(sort ? { sort } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });
    return { items: items.map(withoutWrappedKey), total };
  }

  async searchBrains(input: SearchBrainsInput, actor: Actor) {
    const { items } = await this.listBrains(actor, {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    });
    return rankBrains(items, input.query, input.limit);
  }

  // No service-level role guard when unfiltered, matching listBrains without a workspace
  // filter: the row-level policies on articles decide which brains contribute rows, and
  // the result carries only ids and counts.
  async countArticlesByBrain(actor: Actor, workspaceId?: string) {
    if (workspaceId) requireWorkspaceRole(actor, workspaceId, ["owner", "admin", "member"]);
    return this.store.countArticlesByBrain(actor, workspaceId);
  }

  async getBrain(
    brainId: string,
    actor: Actor,
    limit = 200,
    sort: RoutingIndexSort = "updated",
    offset = 0,
  ): Promise<BrainWithIndex> {
    requireBrainRole(actor, brainId, ["owner", "editor", "commenter", "viewer"]);
    const brain = await this.store.getBrain(brainId, actor);
    if (!brain) throw new NotFoundError("Brain");
    const [articles, articleTotal] = await Promise.all([
      this.store.listRoutingIndex(brainId, actor, limit, sort, offset),
      this.store.countArticles(brainId, actor),
    ]);
    await this.store.audit(actor, "brain.read", `brain:${brainId}`, {
      articleCount: articleTotal,
    });
    return {
      brain: withoutWrappedKey(brain),
      routingIndex: articles.map(toSummary),
      articleTotal,
      role: actor.brainRoles.get(brainId) ?? "viewer",
    };
  }

  async deleteBrain(brainId: string, confirmation: string, actor: Actor) {
    requireBrainRole(actor, brainId, ["owner"]);
    const brain = await this.store.deleteBrain(brainId, confirmation, actor);
    // Deleting the row destroys the only copy of the brain's wrapped data key, so the
    // cascade-deleted ciphertext is unrecoverable even from database backups taken later.
    await this.store.audit(actor, "brain.deleted", `workspace:${brain.workspaceId}`, {
      brainId,
      brainName: brain.name,
    });
  }

  async readArticle(articleId: string, actor: Actor): Promise<ReadArticleResult> {
    // One transaction rather than six: these reads all need the same row-level security
    // context, and opening it separately for each was most of the cost of a read.
    const bundle = await this.store.readArticleBundle(articleId, actor);
    if (!bundle) throw new NotFoundError("Article");
    const {
      article,
      brain,
      version,
      aliases,
      links,
      backlinks,
      unresolvedLinks,
      relationsIndexed,
      sources,
      compactionEnabled,
    } = bundle;
    requireBrainRole(actor, article.brainId, ["owner", "editor", "commenter", "viewer"]);
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const body = decrypt(version.body, key, version.bodyAad).toString("utf8");
    await this.store.audit(actor, "article.read", `article:${articleId}`, {
      version: version.version,
    });
    return {
      ...toSummary(article),
      body,
      aliases,
      links,
      backlinks,
      unresolvedLinks,
      relationsIndexed,
      sources,
      verifiedAt: article.verifiedAt?.toISOString() ?? null,
      reviewAfter: article.reviewAfter?.toISOString() ?? null,
      compaction: articleCompactionView(article, compactionEnabled, this.llmAvailable, actor),
      provenance: {
        actorId: version.actorId,
        clientId: version.clientId,
        changeSummary: version.changeSummary,
        createdAt: version.createdAt.toISOString(),
      },
    };
  }

  async getArticleGraph(brainId: string, actor: Actor) {
    requireBrainRole(actor, brainId, ["owner", "editor", "commenter", "viewer"]);
    const graph = await this.store.getArticleGraph(brainId, actor);
    await this.store.audit(actor, "brain.graph_read", `brain:${brainId}`, {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    });
    return graph;
  }

  /**
   * Reads a whole brain for export in two queries.
   *
   * The route used to call readArticle once per article, which is seven transactions and
   * one audit row each. An export is a single act by one owner, so it records one
   * brain.exported event carrying the article count rather than an article.read per file.
   */
  async exportBrain(brainId: string, actor: Actor, limit = 10_000) {
    requireBrainRole(actor, brainId, ["owner"]);
    const brain = await this.store.getBrain(brainId, actor);
    if (!brain) throw new NotFoundError("Brain");
    // One row past the limit tells a full brain apart from a truncated one. Without it a
    // brain over the limit exported a subset under a manifest that read as complete, and
    // this archive is the documented way to take a backup out.
    const versions = await this.store.listCurrentVersions(brainId, actor, limit + 1);
    if (versions.length > limit) {
      throw new ConflictError("This brain holds more articles than one export can carry", {
        limit,
      });
    }
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const articles = versions.map((version) => ({
      slug: version.slug,
      aliases: version.slugAliases,
      title: version.title,
      summary: version.summary,
      kind: version.kind,
      version: version.version,
      body: decrypt(version.body, key, version.bodyAad).toString("utf8"),
    }));
    await this.store.audit(actor, "brain.exported", `brain:${brainId}`, {
      articleCount: articles.length,
    });
    return { brain: withoutWrappedKey(brain), articles };
  }

  async queueArticleCompaction(articleId: string, actor: Actor) {
    if (!this.llmAvailable) throw new LlmUnavailableError();
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor"]);
    if (["queued", "processing"].includes(article.compactionStatus)) {
      return {
        articleId,
        version: article.currentVersion,
        status: article.compactionStatus as "queued" | "processing",
      };
    }
    if (!["not_requested", "failed"].includes(article.compactionStatus)) {
      throw new ConflictError("Only uncompacted or failed articles can be queued");
    }
    if (!(await this.store.isBrainCompactionEnabled(article.brainId, actor))) {
      throw new ConflictError("LLM compaction is disabled for this workspace");
    }
    await this.store.queueArticleCompaction(articleId, actor);
    await this.store.audit(actor, "article.compaction_queued", `article:${articleId}`, {
      version: article.currentVersion,
    });
    return { articleId, version: article.currentVersion, status: "queued" as const };
  }

  async getArticleCompaction(articleId: string, actor: Actor) {
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor", "commenter", "viewer"]);
    const enabled = await this.store.isBrainCompactionEnabled(article.brainId, actor);
    return articleCompactionView(article, enabled, this.llmAvailable, actor);
  }

  async stageWrite(input: StageWriteInput, actor: Actor): Promise<StagedWriteRecord> {
    requireBrainRole(actor, input.brainId, ["owner", "editor"]);
    const brain = await this.store.getBrain(input.brainId, actor);
    if (!brain) throw new NotFoundError("Brain");
    if (input.idempotencyKey) {
      const existing = await this.store.getStagedWriteByIdempotencyKey(input.idempotencyKey, actor);
      if (existing) return existing;
    }
    if (input.articleId) {
      // The write only proves editor rights on input.brainId. Without this the target
      // article could live in another brain, and promotion would attach a version
      // encrypted with this brain's key to that article.
      const target = await this.store.getArticle(input.articleId, actor);
      if (!target || target.brainId !== input.brainId) throw new NotFoundError("Article");
    }
    const articleId = input.articleId ?? randomUUID();
    const writeId = randomUUID();
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const bodyAad = `brain:${brain.id}:article:${articleId}:write:${writeId}`;
    const bodyText =
      input.operation === "append"
        ? `${(await this.readArticle(articleId, actor)).body.trimEnd()}\n\n${input.body.trimStart()}`
        : input.body;
    const generated = await this.localArticleGenerator.generateArticle({
      title: input.title,
      body: bodyText,
    });
    const resolvedInput: ResolvedStageWriteInput = { ...input, ...generated };
    const body = encrypt(generated.body, key, bodyAad);
    const potentialConflicts = await this.store.findPotentialConflicts(
      input.brainId,
      input.articleId,
      generated.title,
      generated.summary,
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
      hashContent(generated.body),
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
    const brain = await this.store.getBrain(write.brainId, actor);
    if (!brain) throw new NotFoundError("Brain");
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const body = decrypt(write.body, key, write.bodyAad).toString("utf8");
    const result = await this.store.promoteStagedWrite(
      input,
      actor,
      this.llmAvailable,
      extractWikiLinks(body),
    );
    await this.store.audit(actor, "write.promoted", `write:${write.id}`, {
      version: result.version.version,
      decision: input.decision,
    });
    if (result.article.compactionStatus !== "queued") {
      void this.indexPromotedArticle(result.article.id, actor).catch(() => undefined);
    }
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
    let embedding: { model: string; vector: number[] } | null = null;
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

  async recentActivity(brainId: string, limit: number, actor: Actor, source?: "mcp") {
    requireBrainRole(actor, brainId, ["owner", "editor", "commenter", "viewer"]);
    return this.store.recentActivity(brainId, actor, limit, source);
  }

  async reindexArticle(articleId: string, actor: Actor) {
    const article = await this.store.getArticle(articleId, actor);
    if (!article) throw new NotFoundError("Article");
    requireBrainRole(actor, article.brainId, ["owner", "editor"]);
    await this.indexPromotedArticle(articleId, actor);
    return { ok: true, articleId, version: article.currentVersion };
  }

  async reindexArticleRelations(articleId: string, actor: Actor) {
    const bundle = await this.store.readArticleBundle(articleId, actor);
    if (!bundle) throw new NotFoundError("Article");
    requireBrainRole(actor, bundle.article.brainId, ["owner", "editor"]);
    const key = unwrapDataKey(bundle.brain.wrappedKey, this.masterKey, bundle.brain.id);
    const body = decrypt(bundle.version.body, key, bundle.version.bodyAad).toString("utf8");
    return this.store.replaceArticleWikiLinks(
      articleId,
      bundle.version.bodyHash,
      extractWikiLinks(body),
      actor,
    );
  }

  async compactClaimedJob(claim: ClaimedCompactionJob, actor: Actor) {
    if (!this.compactionGenerator) throw new LlmUnavailableError();
    const job = await this.store.getCompactionJob(claim.jobId, actor);
    if (!job || job.claimedBy !== claim.claimId || job.status !== "processing") return null;
    const workspace = await this.store.getWorkspace(job.workspaceId, actor);
    if (!workspace?.llmCompactionEnabled) {
      await this.store.cancelWorkspaceCompactions(job.workspaceId, actor);
      return null;
    }
    const [brain, version] = await Promise.all([
      this.store.getBrain(job.brainId, actor),
      this.store.getVersion(job.articleId, job.articleVersion, actor),
    ]);
    if (!brain || !version) throw new NotFoundError("Compaction source version");
    const key = unwrapDataKey(brain.wrappedKey, this.masterKey, brain.id);
    const sourceBody = decrypt(version.body, key, version.bodyAad).toString("utf8");
    let generated: Awaited<ReturnType<ArticleGenerator["generateArticle"]>>;
    try {
      generated = await this.compactionGenerator.generateArticle({
        title: job.sourceTitle,
        body: sourceBody,
      });
    } catch (error) {
      if (error instanceof ArticleGenerationError) throw error;
      throw new ArticleGenerationError();
    }
    const encrypted = encrypt(generated.body, key, version.bodyAad);
    const result = await this.store.completeCompaction(
      job.id,
      claim.claimId,
      generated,
      encrypted,
      hashContent(generated.body),
      extractWikiLinks(generated.body),
      actor,
    );
    if (!result) return null;
    await this.store.audit(actor, "article.compacted", `article:${result.articleId}`, {
      version: result.version,
      attempt: job.attempts,
      current: result.current,
    });
    if (result.current) {
      await this.store.clearEmbeddings(result.articleId, result.version, actor);
      await this.indexPromotedArticle(result.articleId, actor).catch(() => undefined);
    }
    return result;
  }

  async failClaimedCompaction(claim: ClaimedCompactionJob, error: unknown, actor: Actor) {
    const message = compactErrorMessage(error);
    const retryAt =
      claim.attempts === 1
        ? new Date(Date.now() + 60_000)
        : claim.attempts === 2
          ? new Date(Date.now() + 5 * 60_000)
          : null;
    const result = await this.store.failCompaction(
      claim.jobId,
      claim.claimId,
      message,
      retryAt,
      actor,
    );
    if (!result) return null;
    await this.store.audit(
      actor,
      result.terminal ? "article.compaction_failed" : "article.compaction_retry_scheduled",
      `article:${result.articleId}`,
      { version: result.version, attempt: claim.attempts },
    );
    if (result.terminal && result.current) {
      await this.store.clearEmbeddings(result.articleId, result.version, actor);
      await this.indexPromotedArticle(result.articleId, actor).catch(() => undefined);
    }
    return result;
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
    const { model, vectors } = await this.embeddings.embedPassages(
      splitMarkdownByHeading(article.body).map(
        (section) => `${article.title}\n${article.summary}\n${section.text}`,
      ),
    );
    await Promise.all(
      vectors.map((vector, ordinal) =>
        this.store.setEmbedding(articleId, article.currentVersion, ordinal, vector, model, actor),
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

export function requireTeamRole(actor: Actor, teamId: string, allowed: string[]): void {
  const role = actor.teamRoles.get(teamId);
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
  teamId: string;
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

function compactErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "LLM compaction failed";
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "LLM compaction failed";
}

function articleCompactionView(
  article: ArticleRecord,
  enabled: boolean,
  available: boolean,
  actor: Actor,
) {
  return {
    enabled,
    available,
    status:
      article.compactionStatus === "not_requested"
        ? enabled
          ? ("not_compacted" as const)
          : ("disabled" as const)
        : article.compactionStatus,
    attempts: article.compactionAttempts,
    error: article.compactionError,
    compactedAt: article.compactedAt?.toISOString() ?? null,
    canRetry:
      enabled &&
      available &&
      ["owner", "editor"].includes(actor.brainRoles.get(article.brainId) ?? "") &&
      ["not_requested", "failed"].includes(article.compactionStatus),
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
