import { type Actor, DomainError } from "@rementum/core";

export const accessScopeDescriptions = {
  "team:read": "Read teams, members, and invitations",
  "team:write": "Create teams and manage members and invitations",
  "brain:read": "Read brains, articles, staged writes, and activity",
  "brain:write": "Create brains and stage, promote, import, or curate knowledge",
  "task:read": "Read task queues and comments",
  "task:write": "Create, claim, update, and comment on tasks",
  "connection:read": "Read connected OAuth clients",
  "connection:write": "Revoke connected OAuth clients",
} as const;

export type AccessScope = keyof typeof accessScopeDescriptions;
export type ScopedActor = Actor & {
  scopes: ReadonlySet<AccessScope>;
  workspaceId: string | null;
};

export const allAccessScopes = Object.freeze(Object.keys(accessScopeDescriptions) as AccessScope[]);

export function withAccessScopes(
  actor: Actor,
  value: unknown,
  workspaceId: string | null = null,
): ScopedActor {
  const granted = new Set<AccessScope>();
  const values = typeof value === "string" ? value.split(/\s+/) : [];
  for (const scope of values) {
    if (Object.hasOwn(accessScopeDescriptions, scope)) granted.add(scope as AccessScope);
  }
  return { ...actor, scopes: granted, workspaceId };
}

export function withAllAccessScopes(actor: Actor, workspaceId: string | null = null): ScopedActor {
  return { ...actor, scopes: new Set(allAccessScopes), workspaceId };
}

export function requireAccessScope(actor: ScopedActor, scope: AccessScope): ScopedActor {
  if (!actor.scopes.has(scope)) {
    throw new DomainError(
      "insufficient_scope",
      `The ${scope} OAuth scope is required for this operation`,
      403,
      { requiredScope: scope },
    );
  }
  return actor;
}
