import { getLlmsFullTxt } from "../../lib/llms";

// Served at /llms-full.txt: every documentation page inlined as one plain-text file.
// Evaluated statically at build time; reads docs/ directly without generated code in source control.
export const dynamic = "force-static";

export function GET() {
  return new Response(getLlmsFullTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
