import { NextResponse } from "next/server";

export async function POST() {
  const publicUrl = process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/", publicUrl), 303);
  response.cookies.delete("rementum_access");
  response.cookies.delete("rementum_refresh");
  response.cookies.delete("rementum_pkce");
  response.cookies.delete("rementum_state");
  return response;
}
