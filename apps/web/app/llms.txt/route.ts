import { getLlmsTxt } from "../../lib/llms";

// Served at /llms.txt (https://llmstxt.org): a short index of the docs for language models.
// Evaluated statically at build time; reads docs/ directly without generated code in source control.
export const dynamic = "force-static";

export function GET() {
  return new Response(getLlmsTxt(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
