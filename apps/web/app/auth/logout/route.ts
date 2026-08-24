import { NextResponse } from "next/server";

export async function POST() {
  const publicUrl = process.env.NEXT_PUBLIC_OWL_API_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/", publicUrl), 303);
  response.cookies.delete("owl_access");
  response.cookies.delete("owl_refresh");
  response.cookies.delete("owl_pkce");
  response.cookies.delete("owl_state");
  return response;
}
