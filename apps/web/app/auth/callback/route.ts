import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const publicUrl = process.env.NEXT_PUBLIC_OWL_API_URL ?? "http://localhost:3000";
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const verifier = request.cookies.get("owl_pkce")?.value;
  if (!code || !state || !verifier || state !== request.cookies.get("owl_state")?.value) {
    return new NextResponse("Invalid OAuth callback", { status: 400 });
  }
  const tokenResponse = await fetch(`${publicUrl.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "owl-web",
      redirect_uri: `${publicUrl.replace(/\/$/, "")}/auth/callback`,
      code,
      code_verifier: verifier,
      resource: `${publicUrl.replace(/\/$/, "")}/mcp`,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok)
    return new NextResponse(`Token exchange failed: ${await tokenResponse.text()}`, {
      status: 502,
    });
  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const response = NextResponse.redirect(new URL("/", publicUrl));
  setTokenCookies(response, tokens, publicUrl.startsWith("https:"));
  response.cookies.delete("owl_pkce");
  response.cookies.delete("owl_state");
  return response;
}

export function setTokenCookies(
  response: NextResponse,
  tokens: { access_token: string; refresh_token?: string; expires_in: number },
  secure: boolean,
) {
  response.cookies.set("owl_access", tokens.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: tokens.expires_in,
    path: "/",
  });
  if (tokens.refresh_token)
    response.cookies.set("owl_refresh", tokens.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
}
