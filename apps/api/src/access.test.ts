import type { Actor } from "@rementum/core";
import { describe, expect, it } from "vitest";
import {
  allAccessScopes,
  requireAccessScope,
  withAccessScopes,
  withAllAccessScopes,
} from "./access.js";

const actor: Actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientId: "test-client",
  teamRoles: new Map(),
  workspaceRoles: new Map(),
  brainRoles: new Map(),
};

describe("OAuth access scopes", () => {
  it("accepts exact space-delimited scopes", () => {
    const scoped = withAccessScopes(actor, "brain:read task:write unknown:scope toString");
    expect([...scoped.scopes]).toEqual(["brain:read", "task:write"]);
  });

  it("fails closed for missing or non-standard scope claims", () => {
    expect([...withAccessScopes(actor, undefined).scopes]).toEqual([]);
    expect([...withAccessScopes(actor, ["brain:read"]).scopes]).toEqual([]);
    expect([...withAccessScopes(actor, "brain:read,brain:write").scopes]).toEqual([]);
  });

  it("rejects a valid actor that lacks the required delegated scope", () => {
    const scoped = withAccessScopes(actor, "brain:read");
    expect(() => requireAccessScope(scoped, "brain:write")).toThrow(
      expect.objectContaining({ code: "insufficient_scope", status: 403 }),
    );
  });

  it("grants every scope only through the trusted internal constructor", () => {
    expect([...withAllAccessScopes(actor).scopes]).toEqual(allAccessScopes);
  });
});
