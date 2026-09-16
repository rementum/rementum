import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { LOCALE_LABELS, LOCALES } from "../lib/i18n/locales";
import { LocaleSwitcher } from "./locale-switcher";

describe("LocaleSwitcher label", () => {
  it("shows the locale code and exposes the full language to assistive technology", () => {
    for (const locale of LOCALES) {
      const html = renderToStaticMarkup(
        createElement(LocaleSwitcher, { locale, label: "Language", className: "ml-1" }),
      );
      expect(html).toContain(`>${locale.toUpperCase()}</span>`);
      expect(html).toContain(`aria-label="Language: ${LOCALE_LABELS[locale]}"`);
      expect(html).toContain('class="ml-1"');
    }
  });
});
