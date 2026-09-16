import { describe, expect, it } from "vitest";
import { menuPlacement } from "./menu-placement";

describe("menu placement", () => {
  it("opens above the sidebar footer without crossing the left edge", () => {
    const trigger = { left: 8, right: 64, top: 944, bottom: 980 };
    const result = menuPlacement(
      trigger,
      { width: 1440, height: 1000 },
      { width: 224, height: 128 },
    );
    expect(trigger.left + result.left).toBe(8);
    expect(trigger.top + result.top).toBe(808);
  });
  it("aligns the public header menu within the viewport", () => {
    const trigger = { left: 1170, right: 1226, top: 18, bottom: 54 };
    const result = menuPlacement(
      trigger,
      { width: 1280, height: 720 },
      { width: 224, height: 128 },
    );
    expect(trigger.left + result.left + result.width).toBe(1226);
    expect(trigger.top + result.top).toBe(62);
  });
  it("constrains long workspace menus and narrow viewports", () => {
    const trigger = { left: 16, right: 180, top: 80, bottom: 128 };
    const result = menuPlacement(trigger, { width: 200, height: 400 }, { width: 224, height: 900 });
    expect(result.width).toBe(184);
    expect(result.maxHeight).toBe(256);
    expect(trigger.left + result.left).toBeGreaterThanOrEqual(8);
    expect(trigger.top + result.top + result.maxHeight).toBeLessThanOrEqual(392);
  });
});
