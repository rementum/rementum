import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observePageActivity } from "./page-activity";

describe("page activity", () => {
  let hidden: boolean;
  let focused: boolean;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    hidden = false;
    focused = true;
    vi.stubGlobal("document", Object.assign(new EventTarget(), { hasFocus: () => focused }));
    Object.defineProperty(document, "hidden", { get: () => hidden });
    vi.stubGlobal("window", new EventTarget());
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.unstubAllGlobals();
  });

  it.each([
    [false, true, true],
    [false, false, false],
    [true, true, false],
    [true, false, false],
  ])("initial hidden=%s focus=%s yields active=%s", (isHidden, hasFocus, active) => {
    hidden = isHidden;
    focused = hasFocus;
    const changed = vi.fn();
    dispose = observePageActivity(changed);
    expect(changed).toHaveBeenLastCalledWith(active);
  });

  it("requires both visibility and focus to resume after switching applications or tabs", () => {
    const changed = vi.fn();
    dispose = observePageActivity(changed);
    window.dispatchEvent(new Event("blur"));
    expect(changed).toHaveBeenLastCalledWith(false);
    focused = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(changed).toHaveBeenLastCalledWith(false);
    focused = true;
    hidden = true;
    window.dispatchEvent(new Event("focus"));
    expect(changed).toHaveBeenLastCalledWith(false);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(changed).toHaveBeenLastCalledWith(true);
  });

  it("removes all listeners when the consumer is unmounted", () => {
    const changed = vi.fn();
    dispose = observePageActivity(changed);
    dispose();
    changed.mockClear();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(changed).not.toHaveBeenCalled();
  });
});
