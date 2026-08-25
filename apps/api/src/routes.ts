import { randomBytes } from "node:crypto";
import {
  claimTaskSchema,
  createBrainSchema,
  createTaskSchema,
  createTeamInvitationSchema,
  createTeamSchema,
  promoteWriteSchema,
  searchArticlesSchema,
  stageWriteSchema,
  taskStatusSchema,
} from "@owl-memory/contracts";
import {
  type Actor,
  DomainError,
  hashContent,
  inspectMarkdownArchive,
  type OwlService,
  requireBrainRole,
  slugify,
} from "@owl-memory/core";
import type { AuthRepository } from "@owl-memory/db";
import { hash, verify } from "argon2";
import type { FastifyInstance, FastifyRequest } from "fastify";
import JSZip from "jszip";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { TransactionalMailer } from "./mailer.js";
import { sanitize } from "./mcp.js";

type Authenticate = (request: FastifyRequest) => Promise<Actor>;

export async function registerApiRoutes(
  app: FastifyInstance,
  service: OwlService,
  authenticate: Authenticate,
  authRepository: AuthRepository,
  config: AppConfig,
  mailer: TransactionalMailer | null,
): Promise<void> {
  const publicUrl = config.OWL_PUBLIC_URL.replace(/\/$/, "");
  const authRateLimit = { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } };

  app.get("/api/v1/auth/config", async () => ({ signupEnabled: config.OWL_ALLOW_SIGNUP }));

  app.post("/api/v1/auth/register", authRateLimit, async (request, reply) => {
    if (!config.OWL_ALLOW_SIGNUP) {
      throw new DomainError("signup_disabled", "Public registration is disabled", 403);
    }
    const input = z
      .object({
        email: z.email(),
        displayName: z.string().trim().min(1).max(160),
        password: z.string().min(12).max(1000),
        teamName: z.string().trim().min(1).max(160),
      })
      .parse(request.body);
    const email = input.email.trim().toLowerCase();
    const teamSlug = `${(slugify(input.teamName) || "team").slice(0, 105)}-${randomBytes(6).toString("hex")}`;
    const created = await authRepository.registerAccount(
      email,
      input.displayName,
      await secureHash(input.password),
      input.teamName,
      teamSlug,
    );
    if (created) {
      const token = randomBytes(32).toString("base64url");
      const record = await authRepository.createAuthToken(
        created.user.id,
        "verify_email",
        hashContent(token),
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );
      await sendRequiredEmail(mailer, {
        to: email,
        subject: "Verify your Owl Memory account",
        heading: "Verify your email",
        body: "Confirm this address to activate your Owl Memory account.",
        url: `${publicUrl}/verify-email?token=${encodeURIComponent(token)}`,
        action: "Verify email",
        idempotencyKey: `verify-email/${record.id}`,
      });
    }
    return reply.code(202).send({
      message: "If this address can be registered, a verification email has been sent.",
    });
  });

  app.post("/api/v1/auth/resend-verification", authRateLimit, async (request, reply) => {
    const { email } = z.object({ email: z.email() }).parse(request.body);
    if (!mailer) throw new DomainError("email_unavailable", "Email delivery is unavailable", 503);
    const user = await authRepository.findUserByEmail(email.trim().toLowerCase());
    if (user && !user.emailVerifiedAt) {
      const token = randomBytes(32).toString("base64url");
      const record = await authRepository.createAuthToken(
        user.id,
        "verify_email",
        hashContent(token),
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );
      await sendRequiredEmail(mailer, {
        to: user.email,
        subject: "Verify your Owl Memory account",
        heading: "Verify your email",
        body: "Confirm this address to activate your Owl Memory account.",
        url: `${publicUrl}/verify-email?token=${encodeURIComponent(token)}`,
        action: "Verify email",
        idempotencyKey: `verify-email/${record.id}`,
      });
    }
    return reply.code(202).send({ message: "If verification is pending, an email has been sent." });
  });

  app.post("/api/v1/auth/verify-email", authRateLimit, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(32).max(200) }).parse(request.body);
    if (!(await authRepository.verifyEmail(hashContent(token)))) {
      throw new DomainError("invalid_token", "This verification link is invalid or expired", 410);
    }
    return reply.code(204).send();
  });

  app.post("/api/v1/auth/forgot-password", authRateLimit, async (request, reply) => {
    const { email } = z.object({ email: z.email() }).parse(request.body);
    if (!mailer) throw new DomainError("email_unavailable", "Email delivery is unavailable", 503);
    const user = await authRepository.findUserByEmail(email.trim().toLowerCase());
    if (user) {
      const token = randomBytes(32).toString("base64url");
      const record = await authRepository.createAuthToken(
        user.id,
        "reset_password",
        hashContent(token),
        new Date(Date.now() + 60 * 60 * 1000),
      );
      await sendRequiredEmail(mailer, {
        to: user.email,
        subject: "Reset your Owl Memory password",
        heading: "Reset your password",
        body: "Use this one-time link within one hour to choose a new password.",
        url: `${publicUrl}/reset-password?token=${encodeURIComponent(token)}`,
        action: "Reset password",
        idempotencyKey: `reset-password/${record.id}`,
      });
    }
    return reply.code(202).send({ message: "If the account exists, a reset email has been sent." });
  });

  app.post("/api/v1/auth/reset-password", authRateLimit, async (request, reply) => {
    const input = z
      .object({ token: z.string().min(32).max(200), password: z.string().min(12).max(1000) })
      .parse(request.body);
    if (
      !(await authRepository.resetPassword(
        hashContent(input.token),
        await secureHash(input.password),
      ))
    ) {
      throw new DomainError("invalid_token", "This reset link is invalid or expired", 410);
    }
    return reply.code(204).send();
  });

  app.get("/api/v1/team-invitations/:token", async (request) => {
    const { token } = z.object({ token: z.string().min(32).max(200) }).parse(request.params);
    const invitation = await authRepository.inspectTeamInvitation(hashContent(token));
    if (!invitation)
      throw new DomainError("invalid_invitation", "Invitation is invalid or expired", 410);
    const existing = await authRepository.findUserByEmail(invitation.email);
    return {
      name: invitation.name,
      role: invitation.role,
      existingAccount: Boolean(existing),
      loginRequired: Boolean(existing?.emailVerifiedAt),
    };
  });

  app.post("/api/v1/team-invitations/accept", authRateLimit, async (request, reply) => {
    const input = invitationAcceptanceSchema.parse(request.body);
    const tokenHash = hashContent(input.token);
    const invitation = await authRepository.inspectTeamInvitation(tokenHash);
    if (!invitation)
      throw new DomainError("invalid_invitation", "Invitation is invalid or expired", 410);
    const identity = await resolveInvitationIdentity(
      request,
      input,
      invitation.email,
      authenticate,
      authRepository,
    );
    const accepted = await authRepository.acceptTeamInvitation(
      tokenHash,
      identity.userId,
      identity.displayName,
      identity.passwordHash,
    );
    return reply.code(201).send(accepted);
  });

  app.get("/api/v1/invitations/:token", async (request) => {
    const { token } = z.object({ token: z.string().min(32).max(200) }).parse(request.params);
    const invitation = await authRepository.inspectBrainInvitation(hashContent(token));
    if (!invitation)
      throw new DomainError("invalid_invitation", "Invitation is invalid or expired", 410);
    const existing = await authRepository.findUserByEmail(invitation.email);
    return {
      name: invitation.name,
      role: invitation.role,
      existingAccount: Boolean(existing),
      loginRequired: Boolean(existing?.emailVerifiedAt),
    };
  });

  app.post("/api/v1/invitations/accept", async (request, reply) => {
    const input = invitationAcceptanceSchema.parse(request.body);
    const tokenHash = hashContent(input.token);
    const invitation = await authRepository.inspectBrainInvitation(tokenHash);
    if (!invitation)
      throw new DomainError("invalid_invitation", "Invitation is invalid or expired", 410);
    const identity = await resolveInvitationIdentity(
      request,
      input,
      invitation.email,
      authenticate,
      authRepository,
    );
    const accepted = await authRepository.acceptBrainInvitation(
      tokenHash,
      identity.userId,
      identity.displayName,
      identity.passwordHash,
    );
    return reply.code(201).send(accepted);
  });

  app.get("/api/v1/teams", async (request) => service.listTeams(await authenticate(request)));
  app.post("/api/v1/teams", async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.createTeam(createTeamSchema.parse(request.body), await authenticate(request)),
      ),
  );
  app.get("/api/v1/teams/:teamId/members", async (request) => {
    const { teamId } = z.object({ teamId: z.uuid() }).parse(request.params);
    return service.listTeamMembers(teamId, await authenticate(request));
  });
  app.patch("/api/v1/teams/:teamId/members/:userId", async (request) => {
    const { teamId, userId } = z
      .object({ teamId: z.uuid(), userId: z.uuid() })
      .parse(request.params);
    const { role } = z.object({ role: z.enum(["admin", "member"]) }).parse(request.body);
    return service.updateTeamMemberRole(teamId, userId, role, await authenticate(request));
  });
  app.delete("/api/v1/teams/:teamId/members/:userId", async (request, reply) => {
    const { teamId, userId } = z
      .object({ teamId: z.uuid(), userId: z.uuid() })
      .parse(request.params);
    await service.removeTeamMember(teamId, userId, await authenticate(request));
    return reply.code(204).send();
  });
  app.get("/api/v1/teams/:teamId/invitations", async (request) => {
    const { teamId } = z.object({ teamId: z.uuid() }).parse(request.params);
    return service.listTeamInvitations(teamId, await authenticate(request));
  });
  app.post("/api/v1/teams/:teamId/invitations", async (request, reply) => {
    const actor = await authenticate(request);
    const { teamId } = z.object({ teamId: z.uuid() }).parse(request.params);
    const input = createTeamInvitationSchema.parse(request.body);
    const invitation = await service.proposeTeamInvite(teamId, input.email, input.role, actor);
    const acceptanceUrl = `${publicUrl}/team-invite/${invitation.token}`;
    const emailSent = await sendInvitationEmail(
      mailer,
      request,
      input.email,
      "You were invited to an Owl Memory team",
      "Join the team",
      acceptanceUrl,
      `team-invite/${invitation.id}`,
    );
    return reply.code(201).send({ ...invitation, token: undefined, acceptanceUrl, emailSent });
  });
  app.post("/api/v1/team-invitations/:invitationId/resend", async (request) => {
    const actor = await authenticate(request);
    const { invitationId } = z.object({ invitationId: z.uuid() }).parse(request.params);
    const invitation = await service.resendTeamInvite(invitationId, actor);
    const acceptanceUrl = `${publicUrl}/team-invite/${invitation.token}`;
    const emailSent = await sendInvitationEmail(
      mailer,
      request,
      invitation.email,
      "You were invited to an Owl Memory team",
      "Join the team",
      acceptanceUrl,
      `team-invite/${invitation.id}`,
    );
    return { ...invitation, token: undefined, acceptanceUrl, emailSent };
  });
  app.delete("/api/v1/team-invitations/:invitationId", async (request, reply) => {
    const { invitationId } = z.object({ invitationId: z.uuid() }).parse(request.params);
    await service.revokeTeamInvite(invitationId, await authenticate(request));
    return reply.code(204).send();
  });

  app.get("/api/v1/brains", async (request) => {
    const { workspaceId } = z.object({ workspaceId: z.uuid().optional() }).parse(request.query);
    return service.listBrains(await authenticate(request), workspaceId);
  });
  app.post("/api/v1/brains", async (request, reply) => {
    const actor = await authenticate(request);
    return reply
      .code(201)
      .send(await service.createBrain(createBrainSchema.parse(request.body), actor));
  });
  app.get("/api/v1/brains/:brainId", async (request) => {
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    return service.getBrain(brainId, await authenticate(request));
  });
  app.get("/api/v1/brains/:brainId/activity", async (request) => {
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(request.query);
    return service.recentActivity(brainId, limit, await authenticate(request));
  });
  app.get("/api/v1/articles/:articleId", async (request) => {
    const { articleId } = z.object({ articleId: z.uuid() }).parse(request.params);
    return service.readArticle(articleId, await authenticate(request));
  });
  app.get("/api/v1/articles/:articleId/history", async (request) => {
    const { articleId } = z.object({ articleId: z.uuid() }).parse(request.params);
    return sanitize(await service.listArticleHistory(articleId, await authenticate(request)));
  });
  app.post("/api/v1/search", async (request) =>
    service.search(searchArticlesSchema.parse(request.body), await authenticate(request)),
  );
  app.post("/api/v1/writes", async (request, reply) => {
    const value = await service.stageWrite(
      stageWriteSchema.parse(request.body),
      await authenticate(request),
    );
    return reply.code(201).send(sanitize(value));
  });
  app.get("/api/v1/writes/:writeId", async (request) => {
    const { writeId } = z.object({ writeId: z.uuid() }).parse(request.params);
    return sanitize(await service.getWriteStatus(writeId, await authenticate(request)));
  });
  app.get("/api/v1/writes/:writeId/review", async (request) => {
    const { writeId } = z.object({ writeId: z.uuid() }).parse(request.params);
    const review = await service.reviewStagedWrite(writeId, await authenticate(request));
    return {
      write: sanitize(review.write),
      currentBody: review.currentBody,
      candidateBody: review.candidateBody,
    };
  });
  app.get("/api/v1/brains/:brainId/writes", async (request) => {
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    const { status } = z
      .object({
        status: z.enum(["pending", "promoted", "conflicted", "withdrawn"]).optional(),
      })
      .parse(request.query);
    return sanitize(await service.listStagedWrites(brainId, status, await authenticate(request)));
  });
  app.post("/api/v1/writes/:writeId/promote", async (request) => {
    const { writeId } = z.object({ writeId: z.uuid() }).parse(request.params);
    return sanitize(
      await service.promoteWrite(
        promoteWriteSchema.parse({ ...(request.body as object), writeId }),
        await authenticate(request),
      ),
    );
  });
  app.post("/api/v1/writes/:writeId/withdraw", async (request) => {
    const { writeId } = z.object({ writeId: z.uuid() }).parse(request.params);
    return sanitize(await service.withdrawWrite(writeId, await authenticate(request)));
  });
  app.get("/api/v1/brains/:brainId/tasks", async (request) => {
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    return service.listTasks(brainId, await authenticate(request));
  });
  app.post("/api/v1/tasks", async (request, reply) => {
    const task = await service.createTask(
      createTaskSchema.parse(request.body),
      await authenticate(request),
    );
    return reply.code(201).send(task);
  });
  app.get("/api/v1/tasks/:taskId", async (request) => {
    const { taskId } = z.object({ taskId: z.uuid() }).parse(request.params);
    return service.getTask(taskId, await authenticate(request));
  });
  app.get("/api/v1/tasks/:taskId/comments", async (request) => {
    const { taskId } = z.object({ taskId: z.uuid() }).parse(request.params);
    return service.listTaskComments(taskId, await authenticate(request));
  });
  app.post("/api/v1/tasks/claim", async (request) => {
    const input = claimTaskSchema.parse(request.body);
    return service.claimTask(
      input.brainId,
      input.taskId,
      input.leaseSeconds,
      await authenticate(request),
    );
  });
  app.post("/api/v1/tasks/:taskId/heartbeat", async (request) => {
    const { taskId } = z.object({ taskId: z.uuid() }).parse(request.params);
    const { leaseSeconds } = z
      .object({ leaseSeconds: z.number().int().min(60).max(3600).default(600) })
      .parse(request.body);
    return service.heartbeatTask(taskId, leaseSeconds, await authenticate(request));
  });
  app.post("/api/v1/tasks/:taskId/release", async (request) => {
    const { taskId } = z.object({ taskId: z.uuid() }).parse(request.params);
    const { force } = z.object({ force: z.boolean().default(false) }).parse(request.body ?? {});
    return service.releaseTask(taskId, force, await authenticate(request));
  });
  app.patch("/api/v1/tasks/:taskId", async (request) => {
    const { taskId } = z.object({ taskId: z.uuid() }).parse(request.params);
    const patch = z
      .object({
        status: taskStatusSchema.optional(),
        title: z.string().min(1).max(240).optional(),
        brief: z.string().min(1).max(20_000).optional(),
        priority: z.number().int().min(-100).max(100).optional(),
      })
      .parse(request.body);
    return service.updateTask(
      taskId,
      Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
      await authenticate(request),
    );
  });
  app.post("/api/v1/tasks/:taskId/comments", async (request, reply) => {
    const { taskId } = z.object({ taskId: z.uuid() }).parse(request.params);
    const { body } = z.object({ body: z.string().min(1).max(20_000) }).parse(request.body);
    await service.commentTask(taskId, body, await authenticate(request));
    return reply.code(201).send({ ok: true });
  });
  app.post("/api/v1/brains/:brainId/maintenance/scan", async (request) => {
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    return service.scanMaintenance(brainId, await authenticate(request));
  });
  app.get("/api/v1/brains/:brainId/maintenance", async (request) => {
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    return service.listMaintenance(brainId, await authenticate(request));
  });
  app.patch("/api/v1/maintenance/:candidateId", async (request) => {
    const { candidateId } = z.object({ candidateId: z.uuid() }).parse(request.params);
    const { status } = z.object({ status: z.enum(["resolved", "dismissed"]) }).parse(request.body);
    return service.updateMaintenance(candidateId, status, await authenticate(request));
  });

  app.get("/api/v1/connections", async (request) => {
    const actor = await authenticate(request);
    return authRepository.listConnections(actor.userId);
  });
  app.delete("/api/v1/connections/:grantId", async (request, reply) => {
    const actor = await authenticate(request);
    const { grantId } = z.object({ grantId: z.string().min(1).max(240) }).parse(request.params);
    const revoked = await authRepository.revokeConnection(actor.userId, grantId);
    return revoked ? reply.code(204).send() : reply.code(404).send();
  });

  app.post("/api/v1/brains/:brainId/invitations", async (request, reply) => {
    const actor = await authenticate(request);
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    const input = z
      .object({
        email: z.email(),
        role: z.enum(["editor", "commenter", "viewer"]),
      })
      .parse(request.body);
    const invitation = await service.proposeInvite(brainId, input.email, input.role, actor);
    const acceptanceUrl = `${publicUrl}/invite/${invitation.token}`;
    const emailSent = await sendInvitationEmail(
      mailer,
      request,
      input.email,
      "You were invited to an Owl Memory brain",
      "Open the shared brain",
      acceptanceUrl,
      `brain-invite/${invitation.id}`,
    );
    return reply.code(201).send({
      id: invitation.id,
      expiresAt: invitation.expiresAt,
      acceptanceUrl,
      emailSent,
    });
  });

  app.post("/api/v1/brains/:brainId/imports/preview", async (request) => {
    const actor = await authenticate(request);
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    requireBrainRole(actor, brainId, ["owner", "editor"]);
    const upload = await request.file();
    if (!upload) throw new Error("A ZIP archive is required");
    const inspection = await inspectMarkdownArchive(brainId, await upload.toBuffer());
    return inspection.preview;
  });

  app.post("/api/v1/brains/:brainId/imports/stage", async (request, reply) => {
    const actor = await authenticate(request);
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    requireBrainRole(actor, brainId, ["owner", "editor"]);
    const upload = await request.file();
    if (!upload) throw new Error("A ZIP archive is required");
    const archive = await upload.toBuffer();
    const inspection = await inspectMarkdownArchive(brainId, archive);
    const index = (await service.getBrain(brainId, actor, 10_000)).routingIndex;
    const writes = [];
    for (const document of inspection.documents) {
      const existing = index.find((article) => article.slug === document.slug);
      writes.push(
        sanitize(
          await service.stageWrite(
            stageWriteSchema.parse({
              brainId,
              operation: existing ? "update" : "create",
              articleId: existing?.id,
              slug: document.slug,
              title: document.title,
              keywords: document.keywords,
              kind: document.kind,
              body: document.body,
              baseVersion: existing?.currentVersion,
              changeSummary: `import: ${document.path}`,
              sources: [
                {
                  kind: "import",
                  locator: document.path,
                  checksum: hashContent(document.checksumInput),
                  label: document.path,
                  metadata: { role: "migrated_from", archive: upload.filename },
                },
              ],
              acknowledgePotentialConflicts: true,
              idempotencyKey: `import-${hashContent(archive).slice(0, 16)}-${hashContent(document.path).slice(0, 16)}`,
            }),
            actor,
          ),
        ),
      );
    }
    return reply.code(201).send({ preview: inspection.preview, writes });
  });

  app.get("/api/v1/brains/:brainId/export", async (request, reply) => {
    const actor = await authenticate(request);
    const { brainId } = z.object({ brainId: z.uuid() }).parse(request.params);
    requireBrainRole(actor, brainId, ["owner"]);
    const brain = await service.getBrain(brainId, actor, 10_000);
    const zip = new JSZip();
    const manifest: Array<{ slug: string; version: number; hash: string }> = [];
    for (const summary of brain.routingIndex) {
      const article = await service.readArticle(summary.id, actor);
      const file = `---\ntitle: ${yamlString(article.title)}\nsummary: ${yamlString(article.summary)}\nkind: ${article.kind}\nversion: ${article.currentVersion}\n---\n\n${article.body}\n`;
      zip.file(`${article.slug}.md`, file);
      manifest.push({
        slug: article.slug,
        version: article.currentVersion,
        hash: hashContent(article.body),
      });
    }
    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          format: "owl-memory-export-v1",
          brain: brain.brain,
          exportedAt: new Date().toISOString(),
          articles: manifest,
        },
        null,
        2,
      ),
    );
    const body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${brain.brain.slug}-export.zip"`)
      .send(body);
  });
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

const invitationAcceptanceSchema = z.object({
  token: z.string().min(32).max(200),
  displayName: z.string().trim().min(1).max(160).optional(),
  password: z.string().min(12).max(1000).optional(),
});

async function secureHash(password: string): Promise<string> {
  return hash(password, { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 });
}

async function resolveInvitationIdentity(
  request: FastifyRequest,
  input: z.infer<typeof invitationAcceptanceSchema>,
  invitedEmail: string,
  authenticate: Authenticate,
  authRepository: AuthRepository,
) {
  if (request.headers.authorization) {
    const actor = await authenticate(request);
    const user = await authRepository.findUserById(actor.userId);
    if (!user || user.email.toLowerCase() !== invitedEmail.toLowerCase()) {
      throw new DomainError(
        "wrong_account",
        "Sign in with the email address that received this invitation",
        403,
      );
    }
    return { userId: user.id, displayName: null, passwordHash: null };
  }

  const existing = await authRepository.findUserByEmail(invitedEmail);
  if (existing) {
    if (
      !existing.emailVerifiedAt &&
      input.password &&
      (await verify(existing.passwordHash, input.password))
    ) {
      return { userId: existing.id, displayName: null, passwordHash: null };
    }
    throw new DomainError(
      "login_required",
      "Sign in with the invited account before accepting this invitation",
      409,
    );
  }
  if (!input.displayName || !input.password) {
    throw new DomainError(
      "account_details_required",
      "A display name and password are required for a new account",
      400,
    );
  }
  return {
    userId: null,
    displayName: input.displayName,
    passwordHash: await secureHash(input.password),
  };
}

interface LinkEmail {
  to: string;
  subject: string;
  heading: string;
  body: string;
  url: string;
  action: string;
  idempotencyKey: string;
}

async function sendRequiredEmail(
  mailer: TransactionalMailer | null,
  message: LinkEmail,
): Promise<void> {
  if (!mailer) throw new DomainError("email_unavailable", "Email delivery is unavailable", 503);
  await mailer.send({
    to: message.to,
    subject: message.subject,
    text: `${message.heading}\n\n${message.body}\n\n${message.url}`,
    html: linkEmailHtml(message),
    idempotencyKey: message.idempotencyKey,
  });
}

async function sendInvitationEmail(
  mailer: TransactionalMailer | null,
  request: FastifyRequest,
  to: string,
  subject: string,
  action: string,
  url: string,
  idempotencyKey: string,
): Promise<boolean> {
  if (!mailer) return false;
  try {
    await sendRequiredEmail(mailer, {
      to,
      subject,
      heading: subject,
      body: "Follow this private, seven-day link to accept the invitation.",
      url,
      action,
      idempotencyKey,
    });
    return true;
  } catch (error) {
    request.log.warn(
      { error },
      "Invitation email delivery failed; the copyable link remains valid",
    );
    return false;
  }
}

function linkEmailHtml(message: LinkEmail): string {
  return `<!doctype html><html><body style="margin:0;padding:32px;background:#0c0c0f;color:#f2f2f3;font:15px/1.6 Arial,sans-serif"><main style="max-width:560px;margin:auto;padding:28px;border:1px solid #303036;border-radius:14px;background:#151518"><p style="margin:0 0 30px;color:#9b9ba4">Owl Memory</p><h1 style="margin:0 0 14px;font-size:28px">${escapeHtml(message.heading)}</h1><p style="margin:0 0 24px;color:#b7b7bf">${escapeHtml(message.body)}</p><a href="${escapeHtml(message.url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#f2f2f3;color:#111114;text-decoration:none;font-weight:700">${escapeHtml(message.action)}</a><p style="margin:24px 0 0;color:#71717b;font-size:12px;overflow-wrap:anywhere">${escapeHtml(message.url)}</p></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
