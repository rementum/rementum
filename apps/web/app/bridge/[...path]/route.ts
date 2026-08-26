import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { bridgeApiPath } from "../../../lib/bridge";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function siteOrigin(request: NextRequest): string {
  return new URL(process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? request.nextUrl.origin).origin;
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const token = (await cookies()).get("rementum_session")?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const origin = siteOrigin(request);
  // The bridge presents the site origin to the API, so the API's own origin check cannot
  // see the caller. Repeat that check here or every state-changing route becomes forgeable
  // from another site.
  if (!SAFE_METHODS.has(request.method) && request.headers.get("origin") !== origin) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const apiPath = bridgeApiPath((await context.params).path);
  if (!apiPath) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const base = process.env.REMENTUM_API_INTERNAL_URL ?? "http://api:8787";
  const url = new URL(apiPath, base);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  const headers = new Headers({ cookie: `rementum_session=${token}`, origin });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
  const response = await fetch(url, { method: request.method, headers, body, cache: "no-store" });
  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
