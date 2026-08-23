import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const publicUrl = process.env.NEXT_PUBLIC_OWL_API_URL ?? "http://localhost:3000";
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  const authorization = new URL(`${publicUrl.replace(/\/$/, "")}/oauth/auth`);
  authorization.searchParams.set("client_id", "owl-web");
  authorization.searchParams.set("redirect_uri", `${publicUrl.replace(/\/$/, "")}/auth/callback`);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set(
    "scope",
    "openid profile email offline_access brain:read brain:write task:read task:write",
  );
  authorization.searchParams.set("resource", `${publicUrl.replace(/\/$/, "")}/mcp`);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("state", state);
  const response = NextResponse.redirect(authorization);
  const secure = publicUrl.startsWith("https:");
  response.cookies.set("owl_pkce", verifier, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("owl_state", state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
