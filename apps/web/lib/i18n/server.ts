import { cookies, headers } from "next/headers";
import { type Dictionary, getDictionary } from "./get-dictionary";
import { LOCALE_COOKIE, type Locale, resolveLocale } from "./locales";

async function requestLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
}

export async function requestDictionary(): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await requestLocale();
  return { locale, dict: getDictionary(locale) };
}
