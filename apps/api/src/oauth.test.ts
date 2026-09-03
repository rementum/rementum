import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { verifyLoginPassword } from "./credentials.js";
import { loginFormFields, registerOauthRoutes, workspaceIdFromResource } from "./oauth.js";

const workspaceId = "00000000-0000-4000-8000-000000000002";

describe("OAuth login verification", () => {
  it("performs one password verification for an unknown account", async () => {
    const verifier = vi.fn(async () => false);
    await expect(verifyLoginPassword(null, "candidate", "dummy-hash", verifier)).resolves.toBe(
      false,
    );
    expect(verifier).toHaveBeenCalledOnce();
    expect(verifier).toHaveBeenCalledWith("dummy-hash", "candidate");
  });

  it("performs one password verification for a known account", async () => {
    const verifier = vi.fn(async () => true);
    await expect(
      verifyLoginPassword({ passwordHash: "user-hash" }, "correct", "dummy-hash", verifier),
    ).resolves.toBe(true);
    expect(verifier).toHaveBeenCalledOnce();
    expect(verifier).toHaveBeenCalledWith("user-hash", "correct");
  });

  it("still performs verification when the password is missing", async () => {
    const verifier = vi.fn(async () => false);
    await expect(
      verifyLoginPassword({ passwordHash: "user-hash" }, undefined, "dummy-hash", verifier),
    ).resolves.toBe(false);
    expect(verifier).toHaveBeenCalledWith("user-hash", "");
  });

  it("cannot authenticate a missing account even if dummy verification succeeds", async () => {
    const verifier = vi.fn(async () => true);
    await expect(verifyLoginPassword(null, "candidate", "dummy-hash", verifier)).resolves.toBe(
      false,
    );
    expect(verifier).toHaveBeenCalledOnce();
  });
});

describe("authorization server metadata", () => {
  it("points the root and path-aware metadata locations at the issuer's discovery document", async () => {
    const app = Fastify();
    await registerOauthRoutes(
      app,
      {
        provider: {} as never,
        publicJwks: { keys: [] },
        issuer: "https://rementum.example.test/oauth",
        publicUrl: "https://rementum.example.test",
        workspaceResource: (id) => `https://rementum.example.test/mcp/workspace/${id}`,
        allowSignup: false,
      },
      async () => null,
    );
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/oauth",
      "/.well-known/openid-configuration",
    ]) {
      const response = await app.inject({ method: "GET", url: path });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(
        "https://rementum.example.test/oauth/.well-known/openid-configuration",
      );
    }
    await app.close();
  });
});

describe("OAuth branding and favicon", () => {
  it("serves the brand favicon SVG and redirects favicon.ico", async () => {
    const app = Fastify();
    await registerOauthRoutes(
      app,
      {
        provider: {} as never,
        publicJwks: { keys: [] },
        issuer: "https://rementum.example.test/oauth",
        publicUrl: "https://rementum.example.test",
        workspaceResource: (id) => `https://rementum.example.test/mcp/workspace/${id}`,
        allowSignup: false,
      },
      async () => null,
    );

    const svgResponse = await app.inject({ method: "GET", url: "/icon.svg" });
    expect(svgResponse.statusCode).toBe(200);
    expect(svgResponse.headers["content-type"]).toBe("image/svg+xml");
    expect(svgResponse.headers["cache-control"]).toBe("public, max-age=86400, immutable");
    expect(svgResponse.body).toContain("<svg");
    expect(svgResponse.body).toContain("rmTealTile");

    const icoResponse = await app.inject({ method: "GET", url: "/favicon.ico" });
    expect(icoResponse.statusCode).toBe(302);
    expect(icoResponse.headers.location).toBe("/icon.svg");

    await app.close();
  });

  it("serves interaction page with brand mark, favicon link, and updated CSP", async () => {
    const app = Fastify();
    await registerOauthRoutes(
      app,
      {
        provider: {
          interactionDetails: async () => ({
            uid: "test-uid",
            params: { client_id: "test-client" },
            prompt: { name: "login" },
          }),
          Client: { find: async () => null },
        } as never,
        publicJwks: { keys: [] },
        issuer: "https://rementum.example.test/oauth",
        publicUrl: "https://rementum.example.test",
        workspaceResource: (id) => `https://rementum.example.test/mcp/workspace/${id}`,
        allowSignup: false,
      },
      async () => null,
    );

    const response = await app.inject({ method: "GET", url: "/oauth/interaction/test-uid" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-security-policy"]).toContain("img-src 'self' data:");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.body).toContain('<link rel="icon" href="/icon.svg" type="image/svg+xml">');
    expect(response.body).toContain('viewBox="0 0 718 617"');
    expect(response.body).toContain('id="rmTeal"');
    expect(response.body).not.toContain('viewBox="0 0 32 32"');

    await app.close();
  });
});

describe("sign-in form parsing", () => {
  it("keeps plain string fields and treats anything else as empty credentials", () => {
    expect(loginFormFields({ email: "a@example.test", password: "secret" })).toEqual({
      email: "a@example.test",
      password: "secret",
    });
    expect(loginFormFields({ email: ["a@example.test", "b@example.test"], password: "x" })).toEqual(
      { email: "", password: "" },
    );
    expect(loginFormFields(undefined)).toEqual({ email: "", password: "" });
    expect(loginFormFields({ email: "x".repeat(400), password: "p" })).toEqual({
      email: "",
      password: "",
    });
  });
});

describe("workspace MCP resource parsing", () => {
  it("accepts only an exact workspace MCP resource on the public origin", () => {
    expect(
      workspaceIdFromResource(
        `https://rementum.example.test/mcp/workspace/${workspaceId}`,
        "https://rementum.example.test",
      ),
    ).toBe(workspaceId);
    expect(
      workspaceIdFromResource(
        `https://other.example.test/mcp/workspace/${workspaceId}`,
        "https://rementum.example.test",
      ),
    ).toBeNull();
    expect(
      workspaceIdFromResource(
        `https://rementum.example.test/mcp/workspace/${workspaceId}/extra`,
        "https://rementum.example.test",
      ),
    ).toBeNull();
  });
});
