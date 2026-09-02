export const GITHUB_URL = "https://github.com/rementum/rementum";

// The docs site is served in-stack at /docs on every instance (Caddy proxies it to the docs
// container), so a same-origin relative link works on rementum.dev and on any self-hosted host.
// Keep it a plain <a>, never next/link — /docs is outside the Next router.
export const DOCS_URL = "/docs/";
