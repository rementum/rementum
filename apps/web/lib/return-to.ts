const RETURN_TO_BASE = "http://rementum.invalid";

export function safeReturnTo(value: string | undefined): string {
  if (!value?.startsWith("/")) return "/";
  const target = new URL(value, RETURN_TO_BASE);
  return target.origin === RETURN_TO_BASE
    ? `${target.pathname}${target.search}${target.hash}`
    : "/";
}
