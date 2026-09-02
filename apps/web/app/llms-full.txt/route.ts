import { LLMS_FULL_TXT } from "../../lib/llms-content";

// Served at /llms-full.txt: every documentation page inlined as one plain-text file.
export const dynamic = "force-static";

export function GET() {
  return new Response(LLMS_FULL_TXT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
