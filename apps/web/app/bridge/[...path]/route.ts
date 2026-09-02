import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { apiBase, sessionHeaders } from "../../../lib/api";
import {
  bridgeApiPath,
  bridgeBodyLimit,
  isSameOriginRequest,
  siteOrigin,
} from "../../../lib/bridge";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const token = (await cookies()).get("rementum_session")?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The bridge presents the site origin to the API, so the API's own origin check cannot
  // see the caller. Repeat that check here or every state-changing route becomes forgeable
  // from another site.
  if (!SAFE_METHODS.has(request.method) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const segments = (await context.params).path;
  const apiPath = bridgeApiPath(segments);
  if (!apiPath) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(apiPath, apiBase());
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  const headers = new Headers({
    ...(await sessionHeaders(token)),
    origin: siteOrigin(request.url),
  });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    // The body is buffered before it is forwarded, and the check order above is satisfied
    // by any client that presents a cookie and an Origin header, so the declared length is
    // the only thing standing between a hostile upload and this process's memory. Node
    // reads no more than the declared length; a body sent without one cannot be bounded.
    if (request.headers.has("transfer-encoding")) {
      return NextResponse.json({ error: "length_required" }, { status: 411 });
    }
    const declared = request.headers.get("content-length");
    if (declared !== null && Number(declared) > bridgeBodyLimit(segments)) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    body = await request.arrayBuffer();
  }
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
