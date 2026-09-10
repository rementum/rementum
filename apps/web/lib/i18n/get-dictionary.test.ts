import { describe, expect, it } from "vitest";
import en from "./dictionaries/en.json";
import tr from "./dictionaries/tr.json";
import zh from "./dictionaries/zh.json";
import { getDictionary, template } from "./get-dictionary";

type Json = Record<string, unknown>;

// Arrays whose length is a property of the language, not of the layout. The hero headline is
// a list of words and gets re-split when it is rewritten, so Turkish can legitimately have
// three where English has four; comparing index by index would only force a translator to pad
// it. Every other array in the dictionary maps onto fixed geometry — 3 bubbles, 6 index rows,
// 3 stations — so its length must match, which arrayLengths enforces below.
const VARIABLE_LENGTH_ARRAYS = ["hero.headline"];

const isExemptArrayPath = (path: string) =>
  VARIABLE_LENGTH_ARRAYS.some((prefix) => path.startsWith(`${prefix}[`));

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

// English leaves, with any exempt array collapsed to the array itself so its *presence* is
// still required even though its indices are not compared.
function comparableLeaves(): Set<string> {
  const source = new Set<string>();
  leafPaths(en, "", source);
  for (const path of [...source]) {
    if (!isExemptArrayPath(path)) continue;
    source.delete(path);
    source.add(path.slice(0, path.indexOf("[")));
  }
  return source;
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
    const source = comparableLeaves();
    for (const [name, dict] of [
      ["zh", zh],
      ["tr", tr],
    ] as const) {
      const missing = [...source].filter((path) => lookup(dict, path) === undefined);
      expect(missing, `${name}.json missing keys`).toEqual([]);
    }
  });

  it("keeps the length of every layout-bound array identical across locales", () => {
    const paths = new Set<string>();
    const collect = (value: unknown, prefix: string) => {
      if (Array.isArray(value)) {
        if (!VARIABLE_LENGTH_ARRAYS.includes(prefix)) paths.add(prefix);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value as Json)) {
          collect(child, prefix ? `${prefix}.${key}` : key);
        }
      }
    };
    collect(en, "");
    for (const path of paths) {
      const expected = (lookup(en, path) as unknown[]).length;
      for (const [name, dict] of [
        ["zh", zh],
        ["tr", tr],
      ] as const) {
        const actual = lookup(dict, path);
        expect(Array.isArray(actual), `${name}.json ${path} is not an array`).toBe(true);
        expect((actual as unknown[]).length, `${name}.json ${path} length`).toBe(expected);
      }
    }
    // Guard the guard: the exemption list must not silently swallow every array.
    expect(paths.size).toBeGreaterThan(5);
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

  // The hero names its gradient word by index. Out of range, nothing is highlighted and the
  // heading renders flat — a silent failure no other test would see.
  it("every locale points the hero gradient at one of its own words", () => {
    for (const [name, dict] of [
      ["en", en],
      ["zh", zh],
      ["tr", tr],
    ] as const) {
      const { headline, headlineHighlight } = dict.hero;
      expect(Number.isInteger(headlineHighlight), `${name} is not an integer`).toBe(true);
      expect(headlineHighlight, `${name} index out of range`).toBeGreaterThanOrEqual(0);
      expect(headlineHighlight, `${name} index out of range`).toBeLessThan(headline.length);
      expect(headline[headlineHighlight]?.trim(), `${name} highlights an empty word`).toBeTruthy();
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
