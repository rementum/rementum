import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function hasSession() {
  return Boolean((await cookies()).get("owl_access")?.value);
}

export async function api<T>(path: string): Promise<T> {
  const token = (await cookies()).get("owl_access")?.value;
  if (!token) redirect("/auth/login");
  const base =
    process.env.OWL_API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_OWL_API_URL ??
    "http://localhost:8787";
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/auth/login");
  if (!response.ok)
    throw new Error(`Owl API returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
