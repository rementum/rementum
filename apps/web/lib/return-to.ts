const RETURN_TO_BASE = "http://rementum.invalid";
const DEFAULT_RETURN_TO = "/dashboard";

export function safeReturnTo(value: string | undefined): string {
  if (!value?.startsWith("/")) return DEFAULT_RETURN_TO;
  const target = new URL(value, RETURN_TO_BASE);
  if (target.origin !== RETURN_TO_BASE) return DEFAULT_RETURN_TO;
  const path = `${target.pathname}${target.search}${target.hash}`;
  // The parser resolves dot segments before it reports the path, so "/..//evil.example"
  // passes the origin check above and comes back as "//evil.example": a protocol-relative
  // URL the browser would follow off-site. Judge the string that is actually returned.
  return path.startsWith("//") || new URL(path, RETURN_TO_BASE).origin !== RETURN_TO_BASE
    ? DEFAULT_RETURN_TO
    : path;
}
