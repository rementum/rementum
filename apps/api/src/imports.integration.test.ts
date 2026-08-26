import { randomBytes } from "node:crypto";
import { AuthRepository, createDatabaseClient } from "@rementum/db";
import { exportJWK, generateKeyPair } from "jose";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

async function archive(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function upload(buffer: Buffer, filename = "brain.zip") {
  const boundary = `----rementum${randomBytes(8).toString("hex")}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        "Content-Type: application/zip\r\n\r\n",
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

integration("Markdown archive import", () => {
  it("previews an archive and stages one write per document", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        REMENTUM_PUBLIC_URL: "http://rementum.example.test",
        REMENTUM_DATABASE_URL: databaseUrl,
        REMENTUM_MASTER_KEY: Buffer.alloc(32, 9).toString("base64"),
        REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
        REMENTUM_JWT_JWKS: JSON.stringify({
          keys: [
            { ...(await exportJWK(privateKey)), use: "sig", alg: "RS256", kid: `test-${suffix}` },
          ],
        }),
        REMENTUM_BLOB_DIR: `/tmp/rementum-${suffix}/blobs`,
        REMENTUM_EXPORT_DIR: `/tmp/rementum-${suffix}/exports`,
        REMENTUM_EMBEDDINGS_URL: "http://127.0.0.1:9",
        REMENTUM_DEV_AUTH: "true",
        REMENTUM_LOG_LEVEL: "silent",
      }),
      { mailer: null },
    );
    const database = createDatabaseClient(databaseUrl, 2);
    const auth = new AuthRepository(database);

    try {
      const owner = await auth.registerAccount(
        `import-${suffix}@example.test`,
        "Import owner",
        "password-hash",
        "Import team",
        `import-${suffix}`,
      );
      if (!owner) throw new Error("Registration failed");
      const headers = { "x-rementum-user-id": owner.user.id };

      const brain = await app.inject({
        method: "POST",
        url: "/api/v1/brains",
        headers,
        payload: { workspaceId: owner.workspaceId, slug: `import-${suffix}`, name: "Import brain" },
      });
      expect(brain.statusCode, brain.body).toBe(201);
      const brainId = brain.json().brain.id;

      const zip = await archive({
        "docs/architecture.md":
          "---\ntitle: Architecture\ntags: [design]\n---\n\nThe canonical body.\n",
        "docs/glossary.md": "# Glossary\n\nTerms used across the product.\n",
        "docs/logo.png": "not markdown",
      });

      const previewUpload = upload(zip);
      const preview = await app.inject({
        method: "POST",
        url: `/api/v1/brains/${brainId}/imports/preview`,
        headers: { ...headers, "content-type": previewUpload.contentType },
        payload: previewUpload.payload,
      });
      expect(preview.statusCode).toBe(200);
      // Only the Markdown entries become documents; the image is ignored.
      expect(preview.json().files).toMatchObject([
        { path: "docs/architecture.md", title: "Architecture", suggestedSlug: "architecture" },
        { path: "docs/glossary.md", title: "Glossary", suggestedSlug: "glossary" },
      ]);
      expect(preview.json().brainId).toBe(brainId);

      const stagedUpload = upload(zip);
      const staged = await app.inject({
        method: "POST",
        url: `/api/v1/brains/${brainId}/imports/stage`,
        headers: { ...headers, "content-type": stagedUpload.contentType },
        payload: stagedUpload.payload,
      });
      expect(staged.statusCode).toBe(201);
      expect(staged.json().writes).toHaveLength(2);
      for (const write of staged.json().writes) {
        expect(write).toMatchObject({ status: "pending", operation: "create" });
        expect(write).not.toHaveProperty("body");
      }

      // Re-importing the same archive is idempotent rather than a second pile of writes.
      const againUpload = upload(zip);
      const again = await app.inject({
        method: "POST",
        url: `/api/v1/brains/${brainId}/imports/stage`,
        headers: { ...headers, "content-type": againUpload.contentType },
        payload: againUpload.payload,
      });
      expect(again.statusCode).toBe(201);
      expect(
        again
          .json()
          .writes.map((write: { id: string }) => write.id)
          .sort(),
      ).toEqual(
        staged
          .json()
          .writes.map((write: { id: string }) => write.id)
          .sort(),
      );

      const pending = await app.inject({
        method: "GET",
        url: `/api/v1/brains/${brainId}/writes?status=pending`,
        headers,
      });
      expect(pending.json()).toHaveLength(2);

      const withoutFile = await app.inject({
        method: "POST",
        url: `/api/v1/brains/${brainId}/imports/preview`,
        headers: { ...headers, "content-type": "application/json" },
        payload: {},
      });
      expect(withoutFile.statusCode).toBeGreaterThanOrEqual(400);

      const stranger = await auth.registerAccount(
        `import-stranger-${suffix}@example.test`,
        "Stranger",
        "password-hash",
        "Stranger team",
        `import-stranger-${suffix}`,
      );
      if (!stranger) throw new Error("Registration failed");
      const refusedUpload = upload(zip);
      const refused = await app.inject({
        method: "POST",
        url: `/api/v1/brains/${brainId}/imports/preview`,
        headers: {
          "x-rementum-user-id": stranger.user.id,
          "content-type": refusedUpload.contentType,
        },
        payload: refusedUpload.payload,
      });
      expect(refused.statusCode).toBe(403);
    } finally {
      await database.close();
      await app.close();
    }
  }, 60_000);
});
