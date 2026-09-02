import { describe, expect, it, vi } from "vitest";
import { verifyLoginPassword } from "./credentials.js";
import { loginFormFields, workspaceIdFromResource } from "./oauth.js";

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
