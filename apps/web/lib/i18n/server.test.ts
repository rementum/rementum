import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "./get-dictionary";
import { LOCALE_COOKIE } from "./locales";
import { requestDictionary, requestLocale } from "./server";

const request = vi.hoisted(() => ({ cookie: undefined as string | undefined, language: "en" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === LOCALE_COOKIE && request.cookie ? { value: request.cookie } : undefined,
  }),
  headers: async () => new Headers({ "accept-language": request.language }),
}));

describe("requestDictionary", () => {
  it.each([
    ["tr", "zh-CN", "tr"],
    ["en", "tr-TR", "en"],
    [undefined, "zh-CN", "zh"],
    ["invalid", "tr-TR", "en"],
  ] as const)("resolves cookie %s and language %s to %s", async (cookie, language, locale) => {
    request.cookie = cookie;
    request.language = language;
    expect(await requestLocale()).toBe(locale);
    expect(await requestDictionary()).toEqual({ locale, dict: getDictionary(locale) });
  });
});
