/**
 * Resolve a bridge catch-all route into an API path.
 *
 * Returns null for anything that would leave `/api/v1`: a "." or ".." segment is
 * resolved away by the URL parser, so it would otherwise reach an unrelated endpoint
 * with the caller's session cookie attached.
 */
export function bridgeApiPath(segments: string[]): string | null {
  if (!segments.length) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return `/api/v1/${segments.map(encodeURIComponent).join("/")}`;
}
