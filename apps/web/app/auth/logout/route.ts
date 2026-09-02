import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase, sessionHeaders } from "../../../lib/api";
import { isSameOriginRequest, siteOrigin } from "../../../lib/bridge";

export async function POST(request: Request) {
  // A cross-site form post carries no session cookie, but the response would still clear
  // the browser's cookie and sign the visitor out. The API's own origin check never sees
  // the caller because this route presents the site origin on its behalf.
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const origin = siteOrigin(request.url);
  const token = (await cookies()).get("rementum_session")?.value;
  if (token) {
    await fetch(`${apiBase()}/api/v1/auth/session`, {
      method: "DELETE",
      headers: { ...(await sessionHeaders(token)), origin },
      cache: "no-store",
    }).catch(() => undefined);
  }
  const response = NextResponse.redirect(new URL("/", origin), 303);
  response.cookies.delete("rementum_session");
  return response;
}
