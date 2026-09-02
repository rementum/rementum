/**
 * Resolve a bridge catch-all route into an API path.
 *
 * Returns null for anything that would leave `/api/v1`: a "." or ".." segment is
 * resolved away by the URL parser, so it would otherwise reach an unrelated endpoint
 * with the caller's session cookie attached.
 */
/**
 * The origin browsers must present on a state-changing request to this site.
 *
 * Behind the reference proxy the public origin is configured; the request's own origin is
 * only a fallback for a host-run dev server, where it equals what the browser sees.
 */
export function siteOrigin(requestUrl: string): string {
  return new URL(process.env.NEXT_PUBLIC_REMENTUM_API_URL ?? requestUrl).origin;
}

/** True when a request's Origin header names this site; a missing header fails. */
export function isSameOriginRequest(request: { url: string; headers: Headers }): boolean {
  return request.headers.get("origin") === siteOrigin(request.url);
}

// The API refuses JSON bodies past two megabytes and archive uploads past one hundred, so a
// larger body can only be an attempt to fill this process's memory before it is forwarded.
const JSON_BODY_LIMIT = 2_000_000;
const ARCHIVE_BODY_LIMIT = 101 * 1024 * 1024;

/** The largest request body the bridge will buffer for an API path, in bytes. */
export function bridgeBodyLimit(segments: string[]): number {
  return segments[0] === "brains" && segments[2] === "imports"
    ? ARCHIVE_BODY_LIMIT
    : JSON_BODY_LIMIT;
}

export function bridgeApiPath(segments: string[]): string | null {
  if (!segments.length) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return `/api/v1/${segments.map(encodeURIComponent).join("/")}`;
}
