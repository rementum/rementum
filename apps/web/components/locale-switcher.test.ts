import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { LocaleSwitcher, placementFor } from "./locale-switcher";

// Measured in the browser at a 1400x900 viewport.
const VIEWPORT = { width: 1400, height: 900 };
// The switcher is the first item in the sidebar's bottom bar, at the very bottom of a
// 224px-wide, 100dvh-tall aside.
const SIDEBAR_TRIGGER = { top: 858, bottom: 890, left: 8, right: 95.4 };
// ...and the last item in the public header, at the top right of a sticky nav.
const HEADER_TRIGGER = { top: 50.25, bottom: 82.25, left: 1048, right: 1135.4 };

describe("placementFor", () => {
  // Regression: the menu opened downward from the sidebar's bottom bar, so all three
  // options rendered past the bottom of the viewport and no language could be selected.
  it("opens upward from the sidebar's bottom bar", () => {
    expect(placementFor(SIDEBAR_TRIGGER, VIEWPORT)).toEqual({ direction: "up", align: "start" });
  });

  // Regression: right-aligning a 128px menu to an 87px trigger put its left edge at x=-33,
  // off the left of the viewport as well.
  it("opens downward and right-aligned from the public header", () => {
    expect(placementFor(HEADER_TRIGGER, VIEWPORT)).toEqual({ direction: "down", align: "end" });
  });

  it("prefers opening downward when neither side has room", () => {
    const cramped = { top: 60, bottom: 92, left: 8, right: 95 };
    expect(placementFor(cramped, { width: 1400, height: 200 }).direction).toBe("down");
  });

  it("keeps the menu inside a viewport narrower than the menu plus the trigger", () => {
    const narrow = { top: 10, bottom: 42, left: 30, right: 95 };
    expect(placementFor(narrow, { width: 100, height: 900 }).align).toBe("end");
  });

  it("flips up as soon as the menu would not fit below", () => {
    const trigger = { top: 300, bottom: 332, left: 8, right: 95 };
    expect(placementFor(trigger, { width: 1400, height: 440 }).direction).toBe("up");
    expect(placementFor(trigger, { width: 1400, height: 460 }).direction).toBe("down");
  });
});

describe("LocaleSwitcher label", () => {
  // The collapsed control shows the active language's code: a globe says "this is a
  // language control" but not which language is on.
  it("shows the locale code, not a globe", () => {
    const cases = [
      ["en", "EN"],
      ["tr", "TR"],
      ["zh", "ZH"],
    ] as const;
    for (const [locale, code] of cases) {
      const html = renderToStaticMarkup(
        createElement(LocaleSwitcher, { locale, label: "Language", className: "ml-1" }),
      );
      expect(html).toContain(`<span>${code}</span>`);
      expect(html).not.toContain("🌐");
      // The name still reaches assistive technology and the tooltip.
      expect(html).toContain('aria-label="Language"');
      expect(html).toContain('class="relative ml-1"');
    }
  });
});
