import { NextResponse } from "next/server";

export async function GET() {
  const publicUrl = process.env.NEXT_PUBLIC_OWL_API_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/", publicUrl));
  response.cookies.delete("owl_access");
  response.cookies.delete("owl_refresh");
  return response;
}
