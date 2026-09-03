import { getLlmsFullTxt } from "../../lib/llms";

// Served at /llms-full.txt: every documentation page inlined as one plain-text file.
// force-static: the handler reads docs/ from disk, so it must render once at build and never per
// request in production, which is not guaranteed to have docs/ on disk.
export const dynamic = "force-static";

export function GET() {
  return new Response(getLlmsFullTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
