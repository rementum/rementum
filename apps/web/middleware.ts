import { type NextRequest, NextResponse } from "next/server";
import { LOCALES, type Locale, parseLocale } from "./lib/i18n/locales";

// Server components cannot read the current pathname, so the effective locale is
// published as a request header: /zh and /tr are their own routes, everything else
// falls back to the cookie (or English). The header is set on the *request*, so it
// never reaches the client and cannot be forged from outside.
const LOCALE_HEADER = "x-rementum-locale";

// Extracted from `middleware` so the routing rule is unit-testable on its own.
export function resolveRequestLocale(pathname: string, cookieValue?: string): Locale {
  // Only the first path segment counts: /brains/… must not resolve as a locale.
  const segment = pathname.split("/")[1] ?? "";
  if (segment && segment !== "en" && (LOCALES as readonly string[]).includes(segment)) {
    return parseLocale(segment);
  }
  return parseLocale(cookieValue);
}

export function middleware(request: NextRequest) {
  const locale = resolveRequestLocale(
    request.nextUrl.pathname,
    request.cookies.get("rementum_locale")?.value,
  );
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip Next internals, static assets, and anything with a file extension.
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};

export { LOCALE_HEADER };
