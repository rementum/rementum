export const GITHUB_URL = "https://github.com/rementum/rementum";

// Public origin of the marketing site, used for canonical URLs, Open Graph, sitemap, and robots.
// Defaults to rementum.dev; a self-hosted deploy can override it at build time. No trailing slash.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://rementum.dev").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "Rementum";

// One sentence under ~160 characters, reused as the default meta description and Open Graph text.
export const SITE_DESCRIPTION =
  "Rementum is a self-hosted, open-source memory layer for AI agents: versioned Markdown knowledge, staged conflict-checked writes, and OAuth-secured MCP access you control.";

// The docs site is served in-stack at /docs on every instance (Caddy proxies it to the docs
// container), so a same-origin relative link works on rementum.dev and on any self-hosted host.
// Keep it a plain <a>, never next/link — /docs is outside the Next router.
export const DOCS_URL = "/docs/";
