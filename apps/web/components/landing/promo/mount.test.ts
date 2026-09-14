import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDictionary } from "../../../lib/i18n/get-dictionary";
import { mountPromo, type PromoController } from "./mount";

const { seek, buildScenes } = vi.hoisted(() => ({ seek: vi.fn(), buildScenes: vi.fn() }));
vi.mock("./scenes", () => ({ DURATION: 44.5, buildScenes }));
vi.mock("./timeline", async (importOriginal) => {
  const original = await importOriginal<typeof import("./timeline")>();
  return { ...original, createTimeline: () => ({ onReset: vi.fn(), finalize: vi.fn(), seek }) };
});

// Only the host DOM is stubbed: the real controller owns frame scheduling and cleanup.
class ElementStub {
  style = { setProperty: vi.fn() };
  clientWidth = 960;
  appendChild = vi.fn();
  setAttribute = vi.fn();
  remove = vi.fn();
}

describe("promo playback lifecycle", () => {
  let doc: EventTarget & { hidden: boolean };
  let pending: Map<number, FrameRequestCallback>;
  let now: number;
  let nextId: number;
  let controller: PromoController | undefined;
  let focused: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    now = 0;
    nextId = 0;
    focused = true;
    pending = new Map();
    doc = Object.assign(new EventTarget(), {
      hidden: false,
      hasFocus: () => focused,
      createElement: () => new ElementStub(),
      createElementNS: () => new ElementStub(),
    });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("ResizeObserver", undefined);
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      pending.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  });

  afterEach(() => {
    controller?.destroy();
    controller = undefined;
    vi.unstubAllGlobals();
  });

  async function mount() {
    controller = mountPromo(new ElementStub() as unknown as HTMLElement, getDictionary("en").promo);
    await Promise.resolve();
    return controller;
  }

  function frame(time: number) {
    now = time;
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback(now);
  }

  function hide(hidden: boolean) {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event("visibilitychange"));
  }

  function focus(value: boolean) {
    focused = value;
    window.dispatchEvent(new Event(value ? "focus" : "blur"));
  }

  it.each([60, 120, 144])("caps SVG paints at 30 fps on a %i Hz display", async (hz) => {
    const promo = await mount();
    seek.mockClear();
    promo.play();
    for (let i = 1; i <= hz; i++) frame((i * 1000) / hz);
    expect(seek.mock.calls.length).toBeGreaterThanOrEqual(24);
    expect(seek.mock.calls.length).toBeLessThanOrEqual(30);
    expect(pending.size).toBe(1);
  });

  it("cancels hidden-tab frames and resumes without advancing through hidden time", async () => {
    const promo = await mount();
    promo.play();
    frame(100);
    hide(true);
    expect(pending.size).toBe(0);
    const paints = seek.mock.calls.length;
    frame(10_000);
    expect(seek).toHaveBeenCalledTimes(paints);
    hide(false);
    hide(false);
    expect(pending.size).toBe(1);
    frame(10_020);
    expect(seek).toHaveBeenLastCalledWith(0.12);
  });

  it("does not resume a manually paused or off-screen player when the tab returns", async () => {
    const promo = await mount();
    promo.play();
    hide(true);
    promo.pause();
    hide(false);
    expect(pending.size).toBe(0);
    promo.play();
    expect(pending.size).toBe(1);
    promo.pause();
    expect(pending.size).toBe(0);
  });

  it("does not start while hidden, including when initialization finishes", async () => {
    hide(true);
    controller = mountPromo(new ElementStub() as unknown as HTMLElement, getDictionary("en").promo);
    controller.play();
    await Promise.resolve();
    expect(pending.size).toBe(0);
    hide(false);
    expect(pending.size).toBe(1);
  });

  it("stops on Alt+Tab even while visible, and resumes without jumping ahead", async () => {
    const promo = await mount();
    promo.play();
    frame(100);
    focus(false);
    expect(doc.hidden).toBe(false);
    expect(pending.size).toBe(0);
    frame(10_000);
    hide(false);
    expect(pending.size).toBe(0);
    focus(true);
    focus(true);
    expect(pending.size).toBe(1);
    frame(10_020);
    expect(seek).toHaveBeenLastCalledWith(0.12);
  });

  it("preserves manual pause on focus return and never starts a hidden tab on focus", async () => {
    const promo = await mount();
    promo.play();
    focus(false);
    promo.pause();
    focus(true);
    expect(pending.size).toBe(0);
    hide(true);
    promo.play();
    focus(true);
    expect(pending.size).toBe(0);
  });

  it("does not start when mounted without focus", async () => {
    focus(false);
    const promo = await mount();
    promo.play();
    expect(pending.size).toBe(0);
    focus(true);
    expect(pending.size).toBe(1);
  });

  it("releases scheduled frames and visibility listeners on destroy", async () => {
    const removeListener = vi.spyOn(doc, "removeEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const promo = await mount();
    promo.play();
    promo.destroy();
    expect(pending.size).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("blur", expect.any(Function));
    hide(true);
    hide(false);
    focus(true);
    promo.play();
    expect(pending.size).toBe(0);
  });

  it("cannot restart after destruction during async initialization", async () => {
    controller = mountPromo(new ElementStub() as unknown as HTMLElement, getDictionary("en").promo);
    controller.play();
    controller.destroy();
    await Promise.resolve();
    expect(buildScenes).not.toHaveBeenCalled();
    expect(pending.size).toBe(0);
  });
});
