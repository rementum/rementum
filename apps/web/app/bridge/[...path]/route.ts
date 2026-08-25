import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const token = (await cookies()).get("rementum_access")?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { path } = await context.params;
  const base = process.env.REMENTUM_API_INTERNAL_URL ?? "http://api:8787";
  const url = new URL(`/api/v1/${path.join("/")}`, base);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  const headers = new Headers({ authorization: `Bearer ${token}` });
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
