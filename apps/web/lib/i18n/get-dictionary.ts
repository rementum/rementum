import en from "./dictionaries/en.json";
import tr from "./dictionaries/tr.json";
import zh from "./dictionaries/zh.json";
import type { Locale } from "./locales";

export type Dictionary = typeof en;

const OVERRIDES: Record<Locale, unknown> = { en, zh, tr };

// A zh/tr build that drops a key must not blank the UI: deep-merge the
// locale over English so every missing leaf falls back to English.
function deepMerge(base: unknown, override: unknown): unknown {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (
    base !== null &&
    override !== null &&
    typeof base === "object" &&
    typeof override === "object" &&
    !Array.isArray(override)
  ) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      out[key] = key in out ? deepMerge(out[key], value) : value;
    }
    return out;
  }
  return override ?? base;
}

export function getDictionary(locale: Locale): Dictionary {
  if (locale === "en") return en;
  return deepMerge(en, OVERRIDES[locale]) as Dictionary;
}

// Minimal {name} interpolation for count-carrying strings. Unknown params
// stay verbatim so a translator typo is visible instead of silently empty.
export function template(input: string, params: Record<string, string | number>): string {
  return input.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
