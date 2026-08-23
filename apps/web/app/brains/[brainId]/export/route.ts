import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const token = (await cookies()).get("owl_access")?.value;
  if (!token) return NextResponse.redirect(new URL("/auth/login", _request.url));
  const base = process.env.OWL_API_INTERNAL_URL ?? "http://api:8787";
  const response = await fetch(`${base}/api/v1/brains/${brainId}/export`, {
    headers: { authorization: `Bearer ${token}` },
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
