import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const publicUrl = process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? "http://localhost:3000";
  const apiUrl = process.env.REMENTUM_API_INTERNAL_URL ?? publicUrl;
  const token = (await cookies()).get("rementum_session")?.value;
  if (token) {
    await fetch(`${apiUrl.replace(/\/$/, "")}/api/v1/auth/session`, {
      method: "DELETE",
      headers: {
        cookie: `rementum_session=${token}`,
        origin: new URL(publicUrl).origin,
      },
      cache: "no-store",
    }).catch(() => undefined);
  }
  const response = NextResponse.redirect(new URL("/", publicUrl), 303);
  response.cookies.delete("rementum_session");
  return response;
}
