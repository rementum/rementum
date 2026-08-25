import {
  claimTaskSchema,
  createBrainSchema,
  createTaskSchema,
  promoteWriteSchema,
  searchArticlesSchema,
  stageWriteSchema,
  taskStatusSchema,
} from "@owl-memory/contracts";
import {
  type Actor,
  hashContent,
  inspectMarkdownArchive,
  type OwlService,
  requireBrainRole,
} from "@owl-memory/core";
import type { AuthRepository } from "@owl-memory/db";
import { hash } from "argon2";
import type { FastifyInstance, FastifyRequest } from "fastify";
import JSZip from "jszip";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { sanitize } from "./mcp.js";

type Authenticate = (request: FastifyRequest) => Promise<Actor>;

export async function registerApiRoutes(
  app: FastifyInstance,
  service: OwlService,
  authenticate: Authenticate,
  authRepository: AuthRepository,
  config: AppConfig,
): Promise<void> {
  app.post("/api/v1/invitations/accept", async (request, reply) => {
    const input = z
      .object({
        token: z.string().min(32).max(200),
        displayName: z.string().min(1).max(160),
        password: z.string().min(12).max(1000),
      })
      .parse(request.body);
    const accepted = await authRepository.acceptInvitation(
      hashContent(input.token),
      input.displayName,
      await hash(input.password, { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 }),
    );
    return reply.code(201).send(accepted);
  });
  app.get("/api/v1/brains", async (request) => service.listBrains(await authenticate(request)));
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
    return reply.code(201).send({
      id: invitation.id,
      expiresAt: invitation.expiresAt,
      acceptanceUrl: `${config.OWL_PUBLIC_URL.replace(/\/$/, "")}/invite/${invitation.token}`,
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
