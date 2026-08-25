import { describe, expect, it, vi } from "vitest";
import { verifyLoginPassword } from "./oauth.js";

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
