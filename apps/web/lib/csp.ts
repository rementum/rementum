/**
 * The Content-Security-Policy every page of the web app is served with.
 *
 * Next.js renders inline scripts for its hydration payload and the theme initializer, so
 * scripts are limited to this origin plus inline rather than nonced. The effective
 * restrictions are the rest: no framing, no plugins, forms and connections stay on this
 * origin, and images come only from this origin. That last rule is what stops an article
 * body from loading a remote image that would report every reader's address to its host.
 * Cloudflare Turnstile is the only third party, and only on the account forms.
 */
export function contentSecurityPolicy(options: { development: boolean }): string {
  const turnstile = "https://challenges.cloudflare.com";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${options.development ? " 'unsafe-eval'" : ""} ${turnstile}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${options.development ? " ws: wss:" : ""} ${turnstile}`,
    `frame-src ${turnstile}`,
    "worker-src 'self' blob:",
  ].join("; ");
}
