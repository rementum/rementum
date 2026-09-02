import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError } from "./errors.js";
import { resolveWorkspaceId } from "./service.js";
import type { Actor } from "./types.js";

function actor(workspaces: string[]): Actor {
  return {
    userId: "user",
    clientId: "client",
    systemOwner: false,
    teamRoles: new Map(),
    workspaceRoles: new Map(workspaces.map((id) => [id, "owner" as const])),
    brainRoles: new Map(),
  };
}

describe("resolveWorkspaceId", () => {
  it("uses an explicit workspace", () => {
    expect(resolveWorkspaceId("chosen", actor(["first", "second"]))).toBe("chosen");
  });

  it("selects the only accessible workspace", () => {
    expect(resolveWorkspaceId(undefined, actor(["only"]))).toBe("only");
  });

  it("requires a choice for multiple workspaces", () => {
    expect(() => resolveWorkspaceId(undefined, actor(["first", "second"]))).toThrow(ConflictError);
  });

  it("rejects users without a workspace", () => {
    expect(() => resolveWorkspaceId(undefined, actor([]))).toThrow(ForbiddenError);
  });
});
