import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceContext } from "../../../lib/api";
import { isSameOriginRequest } from "../../../lib/bridge";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const form = await request.formData();
  const workspaceId = String(form.get("workspaceId") ?? "");
  const { workspaces } = await workspaceContext();
  if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const publicUrl = process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? request.url;
  (await cookies()).set("rementum_workspace", workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: publicUrl.startsWith("https:") || new URL(request.url).protocol === "https:",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
  });
  return NextResponse.redirect(new URL("/dashboard", publicUrl), 303);
}
