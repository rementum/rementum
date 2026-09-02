import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

export interface SessionInfo {
  authenticated: boolean;
  /** Instance owner, the only account the instance panel is shown to. */
  systemOwner: boolean;
}

const signedOut: SessionInfo = { authenticated: false, systemOwner: false };

export async function sessionInfo(): Promise<SessionInfo> {
  const token = (await cookies()).get("rementum_session")?.value;
  if (!token) return signedOut;
  try {
    const response = await fetch(`${apiBase()}/api/v1/auth/session`, {
      headers: await sessionHeaders(token),
      cache: "no-store",
    });
    if (!response.ok) return signedOut;
    const body = (await response.json().catch(() => ({}))) as Partial<SessionInfo>;
    return { authenticated: true, systemOwner: body.systemOwner === true };
  } catch {
    return signedOut;
  }
}

export async function hasSession() {
  return (await sessionInfo()).authenticated;
}

/**
 * Gate for the instance panel pages. Anyone else gets the same 404 a missing page gives,
 * so the panel's existence is not advertised; the API refuses them on its own regardless.
 */
export async function requireInstanceOwner(): Promise<void> {
  const session = await sessionInfo();
  if (!session.authenticated) redirect("/auth/login");
  if (!session.systemOwner) notFound();
}

export async function api<T>(path: string): Promise<T> {
  const token = (await cookies()).get("rementum_session")?.value;
  if (!token) redirect("/auth/login");
  const response = await fetch(`${apiBase()}${path}`, {
    headers: await sessionHeaders(token),
    cache: "no-store",
  });
  if (response.status === 401) redirect("/auth/login");
  // A brain, article, or task the visitor cannot see answers 404, which is a page of its
  // own rather than the generic failure boundary every other status lands on.
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`Rementum API returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

/** The API origin this server talks to: the private one in the stack, the public one otherwise. */
export function apiBase() {
  return (
    process.env.REMENTUM_API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_REMENTUM_API_URL ??
    "http://localhost:8787"
  ).replace(/\/$/, "");
}

/**
 * The headers every server-side call on a visitor's behalf carries: their session, and the
 * client address chain the edge proxy recorded. The API keys its rate limits on that
 * address and only believes the header from the proxies it is configured to trust, so
 * without it every visitor would count against this server's single bucket.
 */
export async function sessionHeaders(token: string): Promise<Record<string, string>> {
  return { cookie: sessionCookie(token), ...(await clientAddressHeaders()) };
}

export async function clientAddressHeaders(): Promise<Record<string, string>> {
  const forwardedFor = (await headers()).get("x-forwarded-for");
  return forwardedFor ? { "x-forwarded-for": forwardedFor } : {};
}

function sessionCookie(token: string) {
  return `rementum_session=${token}`;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

export interface Workspace {
  id: string;
  teamId: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member";
  llmCompactionEnabled: boolean;
  llmCompactionAvailable: boolean;
  mcpUrl: string;
  createdAt: string;
}

export async function teamContext(): Promise<{ teams: Team[] }> {
  const teams = await api<Team[]>("/api/v1/teams");
  return { teams };
}

export async function workspaceContext(): Promise<{
  teams: Team[];
  workspaces: Workspace[];
  activeTeam: Team | null;
  activeWorkspace: Workspace | null;
}> {
  const [{ teams }, workspaces] = await Promise.all([
    teamContext(),
    api<Workspace[]>("/api/v1/workspaces"),
  ]);
  const selected = (await cookies()).get("rementum_workspace")?.value;
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === selected) ?? workspaces[0] ?? null;
  return {
    teams,
    workspaces,
    activeWorkspace,
    activeTeam: teams.find((team) => team.id === activeWorkspace?.teamId) ?? null,
  };
}

export interface PublicAuthConfig {
  signupEnabled: boolean;
  turnstileSiteKey: string | null;
}

const publicAuthConfigFallback: PublicAuthConfig = { signupEnabled: false, turnstileSiteKey: null };

export async function publicAuthConfig(): Promise<PublicAuthConfig> {
  try {
    const response = await fetch(`${apiBase()}/api/v1/auth/config`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) return publicAuthConfigFallback;
    const body = (await response.json()) as Partial<PublicAuthConfig>;
    // Normalize so an API that predates the turnstile field still matches the contract.
    return {
      signupEnabled: body.signupEnabled === true,
      turnstileSiteKey: body.turnstileSiteKey ?? null,
    };
  } catch {
    return publicAuthConfigFallback;
  }
}
