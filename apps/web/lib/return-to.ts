const RETURN_TO_BASE = "http://rementum.invalid";
const DEFAULT_RETURN_TO = "/dashboard";

export function safeReturnTo(value: string | undefined): string {
  if (!value?.startsWith("/")) return DEFAULT_RETURN_TO;
  const target = new URL(value, RETURN_TO_BASE);
  return target.origin === RETURN_TO_BASE
    ? `${target.pathname}${target.search}${target.hash}`
    : DEFAULT_RETURN_TO;
}
