import { describe, expect, it } from "vitest";
import en from "./dictionaries/en.json";
import tr from "./dictionaries/tr.json";
import zh from "./dictionaries/zh.json";
import { getDictionary, template } from "./get-dictionary";

type Json = Record<string, unknown>;

// Every leaf path in the English source must exist in zh/tr; extra keys are
// allowed (translators may split a string), missing keys are a test failure
// because the UI would silently fall back to English there.
function leafPaths(value: unknown, prefix: string, out: Set<string>) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) leafPaths(item, `${prefix}[${index}]`, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Json)) {
      leafPaths(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  out.add(prefix);
}

function lookup(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Json)[segment];
  }
  return current;
}

describe("dictionary parity", () => {
  it("zh and tr cover every English leaf", () => {
    const source = new Set<string>();
    leafPaths(en, "", source);
    for (const [name, dict] of [
      ["zh", zh],
      ["tr", tr],
    ] as const) {
      const missing = [...source].filter((path) => lookup(dict, path) === undefined);
      expect(missing, `${name}.json missing keys`).toEqual([]);
    }
  });

  it("interpolation params match across locales", () => {
    const source = new Set<string>();
    leafPaths(en, "", source);
    const paramsOf = (value: unknown) =>
      typeof value === "string" ? [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : [];
    for (const path of source) {
      const expected = paramsOf(lookup(en, path));
      for (const [name, dict] of [
        ["zh", zh],
        ["tr", tr],
      ] as const) {
        expect(paramsOf(lookup(dict, path)), `${name}.json ${path}`).toEqual(expected);
      }
    }
  });
});

describe("getDictionary", () => {
  it("falls back to English for a dropped key", () => {
    const partial = { common: { copy: "Kopyala" } };
    void partial;
    const dict = getDictionary("tr");
    expect(dict.common.copy).toBe("Kopyala");
    // Spot-check a key that must survive the merge as English-typed output.
    expect(typeof dict.dashboard.needsReview).toBe("string");
  });
});

describe("template", () => {
  it("replaces known params and keeps unknown ones verbatim", () => {
    expect(template("Page {page} of {pageCount}", { page: 2, pageCount: 9 })).toBe("Page 2 of 9");
    expect(template("{count} brains", {})).toBe("{count} brains");
  });
});
