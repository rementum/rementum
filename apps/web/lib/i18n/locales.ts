// Locale identifiers for the web UI (homepage + dashboard in v1).
// Cookie values are untrusted input — always go through parseLocale.

export const LOCALES = ["en", "zh", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "rementum_locale";

// Internal request header the middleware sets so a server component can learn the
// route locale (/zh, /tr) without reading the pathname, which it cannot do. It is set
// on the request and never reaches the client.
export const LOCALE_HEADER = "x-rementum-locale";

// BCP 47 tags for <html lang>, Intl, Open Graph, and JSON-LD.
export const HTML_LANG: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  tr: "tr",
};

// URL path for each locale: English lives at the root, the rest at /<locale>.
export const SITE_URL_HREF: Record<Locale, string> = {
  en: "",
  zh: "/zh",
  tr: "/tr",
};

export const INTL_LOCALE: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  tr: "tr",
};

export const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  zh: "zh_CN",
  tr: "tr_TR",
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  tr: "Türkçe",
};

// The switcher's collapsed label. A globe icon says "this is a language control" but not
// which language is active, and the two-letter code fits the sidebar's bottom bar.
export const LOCALE_CODES: Record<Locale, string> = {
  en: "EN",
  zh: "ZH",
  tr: "TR",
};

// The path segments that carry their own localized page. English lives at the root, so it
// has no segment of its own.
const LOCALIZED_SEGMENTS: readonly string[] = LOCALES.filter((each) => each !== DEFAULT_LOCALE);

// True on the routes that exist once per locale ("/", "/zh", "/tr"). The language switcher
// navigates to the target locale's URL here, and stays put everywhere else: those pages
// fall back to the cookie, and sending the visitor to a marketing URL from /dashboard
// would throw away what they were doing.
export function isLocalizedRoutePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const trimmed = pathname.replace(/\/+$/, "");
  if (trimmed === "") return true;
  return LOCALIZED_SEGMENTS.some((segment) => trimmed === `/${segment}`);
}

// Closed-set parser mirroring lib/prefs.ts#parsePref: tampered or stale
// cookie values fall back to English and never reach a render branch.
export function parseLocale(value: string | undefined | null): Locale {
  return value === "en" || value === "zh" || value === "tr" ? value : DEFAULT_LOCALE;
}

// First-visit negotiation from Accept-Language when no cookie exists.
// Matches on primary subtag only (zh-TW -> zh, tr-TR -> tr, en-US -> en)
// and respects quality order; anything unknown falls back to English.
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranges = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [range, ...params] = part.split(";").map((s) => s.trim());
      const qParam = params.find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { range: range?.toLowerCase() ?? "", q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.range && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { range } of ranges) {
    if (range === "*" || range === "en" || range.startsWith("en-")) return "en";
    if (range === "zh" || range.startsWith("zh-")) return "zh";
    if (range === "tr" || range.startsWith("tr-")) return "tr";
  }
  return DEFAULT_LOCALE;
}

// The locale the shell should render in, given everything a request offers.
// The route segment wins (a visitor on /zh asked for Chinese, whatever their
// cookie says); off the localized routes it is the cookie, then Accept-Language.
//
// This runs in the root layout, which passes it to <html lang> and the navigation.
// It has to stay a pure function: it is the one place that decides what language
// the public shell renders in, and a mistake here is invisible to a build.
export function resolveLayoutLocale(
  routeLocale: string | null | undefined,
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  const route = parseLocale(routeLocale);
  if (route !== DEFAULT_LOCALE) return route;
  return resolveLocale(cookieValue, acceptLanguage);
}

// Resolve a stored preference: explicit cookie wins, otherwise negotiate
// from Accept-Language. Used for the cookie-driven dashboard, and by
// resolveLayoutLocale for requests that carry no localized route segment.
export function resolveLocale(
  cookieValue: string | undefined | null,
  acceptLanguage: string | null | undefined,
): Locale {
  if (cookieValue === "en" || cookieValue === "zh" || cookieValue === "tr") return cookieValue;
  if (cookieValue) return DEFAULT_LOCALE;
  return localeFromAcceptLanguage(acceptLanguage);
}
