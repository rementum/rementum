import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase, sessionHeaders } from "../../../../lib/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  // An encoded slash in the route parameter would otherwise be resolved away by the URL
  // parser and send the session cookie to an unrelated API path.
  if (!UUID.test(brainId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const token = (await cookies()).get("rementum_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/auth/login", _request.url));
  const response = await fetch(`${apiBase()}/api/v1/brains/${brainId}/export`, {
    headers: await sessionHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) return new NextResponse(await response.text(), { status: response.status });
  return new NextResponse(response.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition":
        response.headers.get("content-disposition") ?? "attachment; filename=brain-export.zip",
    },
  });
}
