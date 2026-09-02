import { randomBytes } from "node:crypto";
import { hashContent } from "@rementum/core";
import { AuthRepository, createDatabaseClient } from "@rementum/db";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { TransactionalEmail, TransactionalMailer } from "./mailer.js";

const databaseUrl = process.env.REMENTUM_TEST_DATABASE_URL;
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
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const privateJwk = {
      ...(await exportJWK(privateKey)),
      use: "sig",
      alg: "RS256",
      kid: `test-${suffix}`,
    };
    const config = loadConfig({
      NODE_ENV: "test",
      REMENTUM_PUBLIC_URL: "http://rementum.example.test",
      REMENTUM_DATABASE_URL: databaseUrl,
      REMENTUM_MASTER_KEY: Buffer.alloc(32, 9).toString("base64"),
      REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
      REMENTUM_JWT_JWKS: JSON.stringify({ keys: [privateJwk] }),
      REMENTUM_BLOB_DIR: `/tmp/rementum-${suffix}/blobs`,
      REMENTUM_EXPORT_DIR: `/tmp/rementum-${suffix}/exports`,
      REMENTUM_EMBEDDINGS_URL: "http://127.0.0.1:9",
      REMENTUM_LLM_ENABLED: "true",
      REMENTUM_LLM_BASE_URL: "https://llm.example.test/v1",
      REMENTUM_LLM_MODEL: "test-model",
      REMENTUM_ALLOW_SIGNUP: "true",
      REMENTUM_RESEND_API_KEY: "re_test",
      REMENTUM_MAIL_FROM: "Rementum <rementum@example.test>",
      REMENTUM_DEV_AUTH: "true",
      REMENTUM_LOG_LEVEL: "silent",
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

      const unverifiedLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session",
        headers: { origin: "http://rementum.example.test" },
        payload: { email, password: "correct horse battery staple" },
      });
      expect(unverifiedLogin.statusCode).toBe(403);
      expect(unverifiedLogin.json()).toMatchObject({ code: "email_unverified" });

      const verification = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        payload: { token: verificationToken },
      });
      expect(verification.statusCode).toBe(204);
      const user = await auth.findUserByEmail(email);
      expect(user?.emailVerifiedAt).not.toBeNull();
      if (!user) throw new Error("Registered user was not found");

      const invalidLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session",
        headers: { origin: "http://rementum.example.test" },
        payload: { email, password: "this is not the password" },
      });
      expect(invalidLogin.statusCode).toBe(401);
      expect(invalidLogin.json()).toMatchObject({ code: "invalid_credentials" });

      const oauthApiToken = new SignJWT({ client_id: "integration-test", scope: "team:read" })
        .setProtectedHeader({ alg: "RS256", kid: privateJwk.kid })
        .setIssuer("http://rementum.example.test/oauth")
        .setAudience("http://rementum.example.test/api")
        .setSubject(user.id)
        .setExpirationTime("5m")
        .sign(privateKey);

      const oauthRestRequest = await app.inject({
        method: "GET",
        url: "/api/v1/teams",
        headers: { authorization: `Bearer ${await oauthApiToken}` },
      });
      expect(oauthRestRequest.statusCode).toBe(401);
      expect(oauthRestRequest.headers["www-authenticate"]).toBeUndefined();

      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session",
        headers: { origin: "http://rementum.example.test" },
        payload: { email, password: "correct horse battery staple" },
      });
      expect(login.statusCode).toBe(204);
      expect(String(login.headers["set-cookie"])).toContain("HttpOnly");
      expect(String(login.headers["set-cookie"])).toContain("SameSite=Lax");
      const sessionCookie = responseCookie(login.headers["set-cookie"], "rementum_session");

      const session = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: { cookie: sessionCookie },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json()).toEqual({ authenticated: true });

      const teams = await app.inject({
        method: "GET",
        url: "/api/v1/teams",
        headers: { cookie: sessionCookie },
      });
      expect(teams.statusCode).toBe(200);
      expect(teams.json()).toHaveLength(1);
      const firstTeamId = teams.json()[0].id as string;
      const workspaces = await app.inject({
        method: "GET",
        url: "/api/v1/workspaces",
        headers: { cookie: sessionCookie },
      });
      expect(workspaces.statusCode).toBe(200);
      expect(workspaces.json()).toHaveLength(1);

      const rejectedMutation = await app.inject({
        method: "POST",
        url: "/api/v1/teams",
        headers: { cookie: sessionCookie },
        payload: { name: "Rejected origin" },
      });
      expect(rejectedMutation.statusCode).toBe(403);
      expect(rejectedMutation.json()).toMatchObject({ code: "invalid_origin" });

      const firstWorkspaceId = workspaces.json()[0].id as string;
      expect(firstWorkspaceId).not.toBe(firstTeamId);
      expect(workspaces.json()[0]).toMatchObject({
        teamId: firstTeamId,
        mcpUrl: `http://rementum.example.test/mcp/workspace/${firstWorkspaceId}`,
      });

      const metadata = await app.inject({
        method: "GET",
        url: `/.well-known/oauth-protected-resource/mcp/workspace/${firstWorkspaceId}`,
      });
      expect(metadata.statusCode).toBe(200);
      expect(metadata.json()).toMatchObject({
        resource: `http://rementum.example.test/mcp/workspace/${firstWorkspaceId}`,
        authorization_servers: ["http://rementum.example.test/oauth"],
      });
      expect(metadata.json().scopes_supported).toEqual([
        "brain:read",
        "brain:write",
        "task:read",
        "task:write",
      ]);
      expect((await app.inject({ method: "GET", url: "/mcp" })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: "GET", url: `/mcp/teams/${firstTeamId}` })).statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: "GET", url: "/.well-known/oauth-protected-resource" }))
          .statusCode,
      ).toBe(404);
      expect((await app.inject({ method: "GET", url: "/docs" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/openapi.json" })).statusCode).toBe(404);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/.well-known/oauth-protected-resource/mcp",
          })
        ).statusCode,
      ).toBe(404);

      const secondTeam = await app.inject({
        method: "POST",
        url: "/api/v1/teams",
        headers: { "x-rementum-user-id": user.id },
        payload: { name: "Another team" },
      });
      expect(secondTeam.statusCode).toBe(201);
      expect(secondTeam.json().defaultWorkspaceId).not.toBe(secondTeam.json().id);

      const secondWorkspace = await app.inject({
        method: "POST",
        url: `/api/v1/teams/${secondTeam.json().id}/workspaces`,
        headers: { "x-rementum-user-id": user.id },
        payload: { name: "Another workspace" },
      });
      expect(secondWorkspace.statusCode).toBe(201);
      expect(secondWorkspace.json()).toMatchObject({ teamId: secondTeam.json().id });

      const secondTeamWorkspaces = await app.inject({
        method: "GET",
        url: `/api/v1/teams/${secondTeam.json().id}/workspaces`,
        headers: { "x-rementum-user-id": user.id },
      });
      expect(secondTeamWorkspaces.statusCode).toBe(200);
      expect(secondTeamWorkspaces.json()).toHaveLength(2);

      const renamedWorkspace = await app.inject({
        method: "PATCH",
        url: `/api/v1/workspaces/${secondWorkspace.json().id}`,
        headers: { "x-rementum-user-id": user.id },
        payload: { name: "Renamed workspace" },
      });
      expect(renamedWorkspace.statusCode).toBe(200);
      expect(renamedWorkspace.json().name).toBe("Renamed workspace");

      const wrongConfirmation = await app.inject({
        method: "DELETE",
        url: `/api/v1/workspaces/${secondWorkspace.json().id}`,
        headers: { "x-rementum-user-id": user.id },
        payload: { confirmation: "Wrong name" },
      });
      expect(wrongConfirmation.statusCode).toBe(409);

      const deletedWorkspace = await app.inject({
        method: "DELETE",
        url: `/api/v1/workspaces/${secondWorkspace.json().id}`,
        headers: { "x-rementum-user-id": user.id },
        payload: { confirmation: "Renamed workspace" },
      });
      expect(deletedWorkspace.statusCode).toBe(204);

      const lastWorkspace = await app.inject({
        method: "DELETE",
        url: `/api/v1/workspaces/${secondTeam.json().defaultWorkspaceId}`,
        headers: { "x-rementum-user-id": user.id },
        payload: { confirmation: "Default workspace" },
      });
      expect(lastWorkspace.statusCode).toBe(409);

      const invitation = await app.inject({
        method: "POST",
        url: `/api/v1/teams/${secondTeam.json().id}/invitations`,
        headers: { "x-rementum-user-id": user.id },
        payload: { email: `invitee-${suffix}@example.test`, role: "member" },
      });
      expect(invitation.statusCode).toBe(201);
      expect(invitation.json().emailSent).toBe(true);
      expect(invitation.json().acceptanceUrl).toContain("/team-invite/");
      expect(mailer.messages[1]?.idempotencyKey).toMatch(/^team-invite\//);

      // Browser sessions carry a cookie and no Authorization header, so acceptance has to
      // recognise the signed-in actor and refuse an invitation addressed to someone else.
      const inviteToken = String(invitation.json().acceptanceUrl).split("/team-invite/")[1] ?? "";
      const wrongAccount = await app.inject({
        method: "POST",
        url: "/api/v1/team-invitations/accept",
        headers: { cookie: sessionCookie, origin: "http://rementum.example.test" },
        payload: { token: inviteToken },
      });
      expect(wrongAccount.statusCode).toBe(403);
      expect(wrongAccount.json()).toMatchObject({ code: "wrong_account" });

      const logout = await app.inject({
        method: "DELETE",
        url: "/api/v1/auth/session",
        headers: { cookie: sessionCookie, origin: "http://rementum.example.test" },
      });
      expect(logout.statusCode).toBe(204);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/v1/auth/session",
            headers: { cookie: sessionCookie },
          })
        ).statusCode,
      ).toBe(401);

      const relogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session",
        headers: { origin: "http://rementum.example.test" },
        payload: { email, password: "correct horse battery staple" },
      });
      const resetSessionCookie = responseCookie(relogin.headers["set-cookie"], "rementum_session");
      const resetToken = randomBytes(32).toString("base64url");
      await auth.createAuthToken(
        user.id,
        "reset_password",
        hashContent(resetToken),
        new Date(Date.now() + 60_000),
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/auth/reset-password",
            payload: { token: resetToken, password: "new correct horse battery staple" },
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/v1/auth/session",
            headers: { cookie: resetSessionCookie },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await database.close();
      await app.close();
    }
  }, 30_000);

  it("lets the mailbox owner re-register an address that was never verified", async () => {
    if (!databaseUrl) return;
    const suffix = randomBytes(6).toString("hex");
    const mailer = new CaptureMailer();
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const config = loadConfig({
      NODE_ENV: "test",
      REMENTUM_PUBLIC_URL: "http://rementum.example.test",
      REMENTUM_DATABASE_URL: databaseUrl,
      REMENTUM_MASTER_KEY: Buffer.alloc(32, 9).toString("base64"),
      REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
      REMENTUM_JWT_JWKS: JSON.stringify({
        keys: [{ ...(await exportJWK(privateKey)), use: "sig", alg: "RS256", kid: `t-${suffix}` }],
      }),
      REMENTUM_BLOB_DIR: `/tmp/rementum-${suffix}/blobs`,
      REMENTUM_EXPORT_DIR: `/tmp/rementum-${suffix}/exports`,
      REMENTUM_EMBEDDINGS_URL: "http://127.0.0.1:9",
      REMENTUM_ALLOW_SIGNUP: "true",
      REMENTUM_RESEND_API_KEY: "re_test",
      REMENTUM_MAIL_FROM: "Rementum <rementum@example.test>",
      REMENTUM_LOG_LEVEL: "silent",
    });
    const app = await buildApp(config, { mailer });
    const email = `squat-${suffix}@example.test`;
    const register = (password: string, displayName: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email, displayName, password, teamName: "Squat team" },
      });
    const login = (password: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/session",
        headers: { origin: "http://rementum.example.test" },
        payload: { email, password },
      });

    try {
      // A stranger registers the address first and never verifies it.
      expect((await register("stranger password 1", "Stranger")).statusCode).toBe(202);
      // The mailbox owner registers with their own password and gets their own link.
      expect((await register("real owner password 1", "Real owner")).statusCode).toBe(202);
      expect(mailer.messages).toHaveLength(2);
      const ownerMessage = mailer.messages[1];
      if (!ownerMessage) throw new Error("Second verification email was not captured");
      const verification = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        payload: { token: tokenFromUrl(ownerMessage.text) },
      });
      expect(verification.statusCode).toBe(204);
      expect((await login("real owner password 1")).statusCode).toBe(204);
      expect((await login("stranger password 1")).statusCode).toBe(401);

      // A verified address is no longer up for grabs.
      expect((await register("stranger password 2", "Stranger")).statusCode).toBe(202);
      expect((await login("stranger password 2")).statusCode).toBe(401);
      expect((await login("real owner password 1")).statusCode).toBe(204);
    } finally {
      await app.close();
    }
  }, 60_000);
});
function tokenFromUrl(value: string): string {
  const match = value.match(/[?&]token=([^\s]+)/);
  if (!match?.[1]) throw new Error("Email did not contain a token URL");
  return decodeURIComponent(match[1]);
}

function responseCookie(value: string | string[] | undefined, name: string): string {
  const headers = Array.isArray(value) ? value : value ? [value] : [];
  const cookie = headers
    .map((header) => header.split(";", 1)[0])
    .find((item) => item?.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Response did not set ${name}`);
  return cookie;
}
