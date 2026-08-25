import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const access = request.cookies.get("rementum_access")?.value;
  const refresh = request.cookies.get("rementum_refresh")?.value;
  const publicUrl = process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? request.nextUrl.origin;
  const apiResource = `${publicUrl.replace(/\/$/, "")}/api`;
  if (!refresh || (access && !expiresSoon(access) && hasAudience(access, apiResource))) {
    return NextResponse.next();
  }
  const apiUrl = process.env.REMENTUM_API_INTERNAL_URL ?? publicUrl;
  const tokenResponse = await fetch(`${apiUrl.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "rementum-web",
      refresh_token: refresh,
      resource: apiResource,
    }),
  });
  if (!tokenResponse.ok) {
    const response = NextResponse.redirect(new URL("/auth/login", request.url));
    response.cookies.delete("rementum_access");
    response.cookies.delete("rementum_refresh");
    return response;
  }
  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const response = NextResponse.next();
  const secure = publicUrl.startsWith("https:");
  response.cookies.set("rementum_access", tokens.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: tokens.expires_in,
    path: "/",
  });
  if (tokens.refresh_token)
    response.cookies.set("rementum_refresh", tokens.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 60 * 24 * 60 * 60,
      path: "/",
    });
  return response;
}

export const config = { matcher: ["/((?!auth|_next/static|_next/image|favicon.ico).*)"] };

function expiresSoon(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      exp?: number;
    };
    return !payload.exp || payload.exp < Date.now() / 1000 + 30;
  } catch {
    return true;
  }
}

function hasAudience(token: string, expected: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      aud?: string | string[];
    };
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    return audiences.includes(expected);
  } catch {
    return false;
  }
}
