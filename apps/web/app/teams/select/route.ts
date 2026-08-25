import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { teamContext } from "../../../lib/api";

export async function POST(request: Request) {
  const form = await request.formData();
  const teamId = String(form.get("teamId") ?? "");
  const { teams } = await teamContext();
  if (!teams.some((team) => team.id === teamId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  (await cookies()).set("rementum_team", teamId, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      (process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? request.url).startsWith("https:") ||
      new URL(request.url).protocol === "https:",
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
  });
  return NextResponse.redirect(new URL("/", request.url), 303);
}
