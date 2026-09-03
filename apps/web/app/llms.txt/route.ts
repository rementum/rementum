import { getLlmsTxt } from "../../lib/llms";

// Served at /llms.txt (https://llmstxt.org): a short index of the docs for language models.
// force-static: the index is fixed at build time and must stay in step with /llms-full.txt.
export const dynamic = "force-static";

export function GET() {
  return new Response(getLlmsTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
