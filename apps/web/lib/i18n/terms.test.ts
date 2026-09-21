import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderTerms } from "./terms";

describe("renderTerms", () => {
  it("returns unmarked text unchanged", () => {
    expect(renderTerms("Active brains")).toBe("Active brains");
  });

  it.each([
    ["Aktif [[brain]]", 'Aktif <span lang="en">brain</span>'],
    [
      "Use [[brain]] and [[migration]] here",
      'Use <span lang="en">brain</span> and <span lang="en">migration</span> here',
    ],
    ["[[brain]] and [[worker]]", '<span lang="en">brain</span> and <span lang="en">worker</span>'],
  ])("wraps source terms in %s", (value, expected) => {
    expect(renderToStaticMarkup(renderTerms(value))).toBe(expected);
  });

  it("escapes markup inside a term", () => {
    expect(renderToStaticMarkup(renderTerms("[[<b>brain</b>]]"))).toBe(
      '<span lang="en">&lt;b&gt;brain&lt;/b&gt;</span>',
    );
  });
});
