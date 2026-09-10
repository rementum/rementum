// Locale identifiers for the web UI (homepage + dashboard in v1).
// Cookie values are untrusted input — always go through parseLocale.

export const LOCALES = ["en", "zh", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "rementum_locale";

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

// Resolve the effective locale: explicit cookie wins, otherwise negotiate
// from Accept-Language (dashboard / layout only — the static landing page
// deliberately sees empty cookies and stays English-first, see app/page.tsx).
export function resolveLocale(
  cookieValue: string | undefined | null,
  acceptLanguage: string | null | undefined,
): Locale {
  if (cookieValue === "en" || cookieValue === "zh" || cookieValue === "tr") return cookieValue;
  if (cookieValue) return DEFAULT_LOCALE;
  return localeFromAcceptLanguage(acceptLanguage);
}
