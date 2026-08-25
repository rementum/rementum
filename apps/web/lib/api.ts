import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function hasSession() {
  return Boolean((await cookies()).get("rementum_access")?.value);
}

export async function api<T>(path: string): Promise<T> {
  const token = (await cookies()).get("rementum_access")?.value;
  if (!token) redirect("/auth/login");
  const base =
    process.env.REMENTUM_API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_REMENTUM_API_URL ??
    "http://localhost:8787";
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/auth/login");
  if (!response.ok)
    throw new Error(`Rementum API returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

export async function teamContext(): Promise<{ teams: Team[]; activeTeam: Team | null }> {
  const teams = await api<Team[]>("/api/v1/teams");
  const selected = (await cookies()).get("rementum_team")?.value;
  return { teams, activeTeam: teams.find((team) => team.id === selected) ?? teams[0] ?? null };
}

export async function publicAuthConfig(): Promise<{ signupEnabled: boolean }> {
  const base =
    process.env.REMENTUM_API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_REMENTUM_API_URL ??
    "http://localhost:8787";
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/auth/config`, {
      cache: "no-store",
    });
    return response.ok ? response.json() : { signupEnabled: false };
  } catch {
    return { signupEnabled: false };
  }
}
