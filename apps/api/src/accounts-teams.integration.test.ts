import { randomBytes } from "node:crypto";
import { AuthRepository, createDatabaseClient } from "@owl-memory/db";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { TransactionalEmail, TransactionalMailer } from "./mailer.js";

const databaseUrl = process.env.OWL_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

class CaptureMailer implements TransactionalMailer {
  readonly messages: TransactionalEmail[] = [];

  async send(message: TransactionalEmail) {
    this.messages.push(message);
    return { id: `email-${this.messages.length}` };
  }
}

integration("account and team HTTP flows", () => {
  it("registers, verifies, creates a team, and emails an invitation", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const mailer = new CaptureMailer();
    const config = loadConfig({
      NODE_ENV: "test",
      OWL_PUBLIC_URL: "http://owl.example.test",
      OWL_DATABASE_URL: databaseUrl,
      OWL_MASTER_KEY: Buffer.alloc(32, 9).toString("base64"),
      OWL_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
      OWL_BLOB_DIR: `/tmp/owl-memory-${suffix}/blobs`,
      OWL_EXPORT_DIR: `/tmp/owl-memory-${suffix}/exports`,
      OWL_EMBEDDINGS_URL: "http://127.0.0.1:9",
      OWL_LLM_ENABLED: "true",
      OWL_LLM_BASE_URL: "https://llm.example.test/v1",
      OWL_LLM_MODEL: "test-model",
      OWL_ALLOW_SIGNUP: "true",
      OWL_RESEND_API_KEY: "re_test",
      OWL_MAIL_FROM: "Owl Memory <owl@example.test>",
      OWL_DEV_AUTH: "true",
      OWL_LOG_LEVEL: "silent",
    });
    const app = await buildApp(config, { mailer });
    const database = createDatabaseClient(databaseUrl, 1);
    const auth = new AuthRepository(database);
    const email = `http-${suffix}@example.test`;

    try {
      const registration = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email,
          displayName: "HTTP User",
          password: "correct horse battery staple",
          teamName: "HTTP team",
        },
      });
      expect(registration.statusCode).toBe(202);
      expect(mailer.messages).toHaveLength(1);
      const verificationMessage = mailer.messages[0];
      if (!verificationMessage) throw new Error("Verification email was not captured");
      expect(verificationMessage.idempotencyKey).toMatch(/^verify-email\//);
      const verificationToken = tokenFromUrl(verificationMessage.text);

      const verification = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        payload: { token: verificationToken },
      });
      expect(verification.statusCode).toBe(204);
      const user = await auth.findUserByEmail(email);
      expect(user?.emailVerifiedAt).not.toBeNull();
      if (!user) throw new Error("Registered user was not found");

      const teams = await app.inject({
        method: "GET",
        url: "/api/v1/teams",
        headers: { "x-owl-user-id": user.id },
      });
      expect(teams.statusCode).toBe(200);
      expect(teams.json()).toHaveLength(1);

      const secondTeam = await app.inject({
        method: "POST",
        url: "/api/v1/teams",
        headers: { "x-owl-user-id": user.id },
        payload: { name: "Another team" },
      });
      expect(secondTeam.statusCode).toBe(201);

      const invitation = await app.inject({
        method: "POST",
        url: `/api/v1/teams/${secondTeam.json().id}/invitations`,
        headers: { "x-owl-user-id": user.id },
        payload: { email: `invitee-${suffix}@example.test`, role: "member" },
      });
      expect(invitation.statusCode).toBe(201);
      expect(invitation.json().emailSent).toBe(true);
      expect(invitation.json().acceptanceUrl).toContain("/team-invite/");
      expect(mailer.messages[1]?.idempotencyKey).toMatch(/^team-invite\//);
    } finally {
      await database.close();
      await app.close();
    }
  }, 30_000);
});

function tokenFromUrl(value: string): string {
  const match = value.match(/[?&]token=([^\s]+)/);
  if (!match?.[1]) throw new Error("Email did not contain a token URL");
  return decodeURIComponent(match[1]);
}
