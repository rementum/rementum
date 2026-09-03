import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";
import { verifyLoginPassword } from "./credentials.js";
import {
  buildOauthRuntime,
  clientMetadataDocumentHost,
  loginFormFields,
  type OauthRuntime,
  redirectTarget,
  registerOauthRoutes,
  workspaceIdFromResource,
} from "./oauth.js";

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

  it("advertises client id metadata documents next to dynamic registration", async () => {
    const runtime = await buildOauthRuntime(
      loadConfig({
        NODE_ENV: "test",
        REMENTUM_PUBLIC_URL: "https://rementum.example.test",
        REMENTUM_DATABASE_URL: "postgres://owl:secret@localhost/owl",
        REMENTUM_MASTER_KEY: "master-key",
        REMENTUM_COOKIE_KEYS: "cookie-key-at-least-sixteen-characters",
      }),
      // Discovery never touches the adapter, so no database is needed to read it.
      { sql: undefined } as never,
    );
    const server = createServer(runtime.provider.callback());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/.well-known/openid-configuration`);
      expect(response.status).toBe(200);
      const metadata = await response.json();
      expect(metadata).toMatchObject({
        issuer: "https://rementum.example.test/oauth",
        client_id_metadata_document_supported: true,
        code_challenge_methods_supported: ["S256"],
      });
      // Registration stays on for clients without a hosted document, such as Cursor.
      expect(metadata.registration_endpoint).toMatch(/\/reg$/);
      // Claude only picks a metadata document when it can also act as a public client.
      expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("consent screen", () => {
  const uid = "interaction-uid";

  async function consentApp(params: Record<string, unknown>, client?: { clientName?: string }) {
    const app = Fastify();
    const find = vi.fn(async () => client);
    const runtime = {
      provider: {
        interactionDetails: async () => ({ uid, prompt: { name: "consent" }, params }),
        Client: { find },
      },
      publicJwks: { keys: [] },
      issuer: "https://rementum.example.test/oauth",
      publicUrl: "https://rementum.example.test",
      workspaceResource: (id: string) => `https://rementum.example.test/mcp/workspace/${id}`,
      allowSignup: false,
    } as unknown as OauthRuntime;
    await registerOauthRoutes(app, runtime, async () => null);
    const response = await app.inject({ method: "GET", url: `/oauth/interaction/${uid}` });
    await app.close();
    return { response, find };
  }

  it("names a metadata document client by its host and warns about a loopback callback", async () => {
    const { response, find } = await consentApp({
      client_id: "https://claude.ai/oauth/claude-code-client-metadata",
      redirect_uri: "http://localhost:3118/callback",
      scope: "openid brain:read",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<strong>claude.ai</strong> requests access to Rementum.");
    expect(response.body).toContain(
      "<code>https://claude.ai/oauth/claude-code-client-metadata</code>",
    );
    expect(response.body).toContain("<strong>localhost</strong>, a program on this computer.");
    expect(response.body).toContain("openid brain:read");
    // The document was already fetched and validated when the interaction was created.
    expect(find).not.toHaveBeenCalled();
  });

  it("names a registered client by its registered name and shows the callback host", async () => {
    const { response, find } = await consentApp(
      {
        client_id: "registered-client",
        redirect_uri: "https://www.cursor.com/agents/mcp/oauth/callback",
        scope: "openid",
      },
      { clientName: "Cursor" },
    );
    expect(find).toHaveBeenCalledWith("registered-client");
    expect(response.body).toContain("<strong>Cursor</strong> requests access to Rementum.");
    expect(response.body).toContain("<strong>www.cursor.com</strong>.");
    expect(response.body).not.toContain("client metadata document");
    expect(response.body).not.toContain("a program on this computer");
  });

  it("escapes everything the client chose", async () => {
    const { response } = await consentApp(
      { client_id: "registered-client", redirect_uri: "https://<b>evil</b>/cb", scope: "<s>" },
      { clientName: "<script>alert(1)</script>" },
    );
    expect(response.body).not.toContain("<script>");
    expect(response.body).not.toContain("<b>");
    expect(response.body).not.toContain("<s>");
    expect(response.body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("client identification", () => {
  it("recognises a metadata document client id by its https host", () => {
    expect(clientMetadataDocumentHost("https://claude.ai/oauth/claude-code-client-metadata")).toBe(
      "claude.ai",
    );
    expect(clientMetadataDocumentHost("https://client.example.test:8443/oauth/client.json")).toBe(
      "client.example.test:8443",
    );
    expect(clientMetadataDocumentHost("http://claude.ai/oauth/claude-code-client-metadata")).toBe(
      null,
    );
    expect(clientMetadataDocumentHost("registered-client")).toBeNull();
  });

  it("describes where the authorization code will be sent", () => {
    expect(redirectTarget("http://localhost:3118/callback")).toEqual({
      label: "localhost",
      loopback: true,
    });
    expect(redirectTarget("http://127.0.0.1:49152/callback")).toEqual({
      label: "127.0.0.1",
      loopback: true,
    });
    expect(redirectTarget("http://[::1]:3000/callback")).toEqual({
      label: "[::1]",
      loopback: true,
    });
    expect(redirectTarget("https://claude.ai/api/mcp/auth_callback")).toEqual({
      label: "claude.ai",
      loopback: false,
    });
    expect(redirectTarget("cursor://anysphere.cursor-mcp/oauth/callback")).toEqual({
      label: "cursor://anysphere.cursor-mcp",
      loopback: false,
    });
    expect(redirectTarget("not a url")).toEqual({ label: "not a url", loopback: false });
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
