import { LLMS_TXT } from "../../lib/llms-content";

// Served at /llms.txt (https://llmstxt.org): a short index of the docs for language models.
// The content is baked at generation time because docs/ is outside the web build context.
export const dynamic = "force-static";

export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
