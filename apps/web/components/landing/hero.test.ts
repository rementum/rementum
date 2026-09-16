import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "../../lib/i18n/get-dictionary";
import { Hero } from "./hero";

describe("Hero locales", () => {
  it("uses the approved slogan", () => {
    const html = renderToStaticMarkup(
      createElement(Hero, { githubUrl: "https://example.test", dict: getDictionary("en") }),
    );
    expect(html.replace(/<[^>]*>/g, "")).toContain("Your agents need a better memory");
  });
  it("renders translated hero copy without crashing", () => {
    const zh = renderToStaticMarkup(
      createElement(Hero, { githubUrl: "https://example.test", dict: getDictionary("zh") }),
    );
    expect(zh).toContain("需要更好的记忆");
    expect(zh).toContain("开始使用");
    expect(zh).not.toContain("need a better memory");

    const tr = renderToStaticMarkup(
      createElement(Hero, { githubUrl: "https://example.test", dict: getDictionary("tr") }),
    );
    expect(tr).toContain("daha iyi bir hafızaya ihtiyacı var");
    expect(tr).toContain("Başlayın");
  });
});
