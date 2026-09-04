/*
 * Mounts the "How it works" animation into a host element and drives it with requestAnimationFrame.
 * The stage is a fixed 1920x1080 canvas scaled to the host's width, so every coordinate in the
 * scenes is the same as in the rendered video, and text stays vector-crisp at any pixel density.
 *
 * Loaded lazily by the landing-page component; nothing here runs on the server.
 */

import { buildScenes, DURATION, type SceneCtx } from "./scenes";
import {
  applyTextKind,
  C,
  createTimeline,
  ease,
  MONO,
  SANS,
  svg,
  type TextKind,
  txt,
} from "./timeline";

export interface PromoController {
  readonly duration: number;
  play(): void;
  pause(): void;
  destroy(): void;
}

const STAGE_W = 1920;
const STAGE_H = 1080;

function el(tag: string, style: Partial<CSSStyleDeclaration>, parent: Element): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  parent.appendChild(node);
  return node;
}

function setText(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

async function waitForFonts(stage: HTMLElement) {
  if (!("fonts" in document)) return;
  // Chip and bubble widths come from text measurement, so the real faces must be in before the
  // scenes are built. The families are read back computed, because `next/font` renames them.
  const probe = el("span", { fontFamily: MONO }, stage);
  const sans = getComputedStyle(stage).fontFamily;
  const mono = getComputedStyle(probe).fontFamily;
  probe.remove();
  await Promise.all(
    [`600 46px ${sans}`, `500 20px ${sans}`, `500 17px ${mono}`].map((font) =>
      document.fonts.load(font).catch(() => undefined),
    ),
  );
  await document.fonts.ready;
}

export function mountPromo(host: HTMLElement): PromoController {
  const stage = el(
    "div",
    {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${STAGE_W}px`,
      height: `${STAGE_H}px`,
      overflow: "hidden",
      transformOrigin: "0 0",
      background: C.canvas,
      color: C.ink,
      fontFamily: SANS,
      fontWeight: "400",
      pointerEvents: "none",
      userSelect: "none",
    },
    host,
  );
  stage.setAttribute("aria-hidden", "true");
  stage.style.setProperty("-webkit-font-smoothing", "antialiased");
  el(
    "div",
    {
      position: "absolute",
      inset: "0",
      background: [
        "radial-gradient(55% 45% at 50% 42%, rgb(74 164 143 / 11%), transparent 72%)",
        "radial-gradient(35% 35% at 88% 92%, rgb(47 124 104 / 10%), transparent 70%)",
        "radial-gradient(30% 30% at 8% 10%, rgb(47 124 104 / 8%), transparent 70%)",
        C.canvas,
      ].join(", "),
    },
    stage,
  );
  const dots = el(
    "div",
    {
      position: "absolute",
      inset: "0",
      backgroundImage: "radial-gradient(rgb(158 201 193 / 9%) 1.2px, transparent 1.8px)",
      backgroundSize: "30px 30px",
    },
    stage,
  );
  const mask = "radial-gradient(70% 70% at 50% 50%, #000 40%, transparent 100%)";
  dots.style.setProperty("mask-image", mask);
  dots.style.setProperty("-webkit-mask-image", mask);

  const art = svg("svg", {
    viewBox: `0 0 ${STAGE_W} ${STAGE_H}`,
    width: STAGE_W,
    height: STAGE_H,
    style: "position:absolute;inset:0",
  });
  stage.appendChild(art);
  const defs = svg("defs", {}, art);
  // Filter regions are generous: a blurred 7px packet needs far more than its bounding box.
  const glow = svg(
    "filter",
    { id: "rmp-glow", x: "-60%", y: "-60%", width: "220%", height: "220%" },
    defs,
  );
  svg("feGaussianBlur", { stdDeviation: 26 }, glow);
  const softGlow = svg(
    "filter",
    { id: "rmp-soft-glow", x: "-250%", y: "-250%", width: "600%", height: "600%" },
    defs,
  );
  svg("feGaussianBlur", { stdDeviation: 10 }, softGlow);
  const tealStroke = svg(
    "linearGradient",
    { id: "rmp-teal-stroke", x1: 0, y1: 0, x2: 1, y2: 1 },
    defs,
  );
  svg("stop", { offset: 0, "stop-color": C.teal }, tealStroke);
  svg("stop", { offset: 1, "stop-color": "#2e7d64" }, tealStroke);
  const tealMark = svg(
    "linearGradient",
    { id: "rmp-teal-mark", x1: 120, y1: 150, x2: 470, y2: 600, gradientUnits: "userSpaceOnUse" },
    defs,
  );
  svg("stop", { offset: 0, "stop-color": C.teal }, tealMark);
  svg("stop", { offset: 1, "stop-color": "#2e7d64" }, tealMark);
  // User-space coordinates: a perfectly horizontal link has a zero-height bounding box, and an
  // objectBoundingBox gradient paints nothing on it.
  const link = svg(
    "linearGradient",
    { id: "rmp-link", x1: 478, y1: 0, x2: 1036, y2: 0, gradientUnits: "userSpaceOnUse" },
    defs,
  );
  svg("stop", { offset: 0, "stop-color": C.deep }, link);
  svg("stop", { offset: 1, "stop-color": C.teal }, link);

  const kicker = el(
    "div",
    {
      position: "absolute",
      left: "112px",
      top: "84px",
      display: "flex",
      alignItems: "center",
      gap: "14px",
      font: `500 20px ${MONO}`,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: C.ink3,
      opacity: "0",
    },
    stage,
  );
  el(
    "span",
    {
      width: "9px",
      height: "9px",
      flexShrink: "0",
      borderRadius: "50%",
      background: `linear-gradient(90deg, ${C.deep}, ${C.mint})`,
    },
    kicker,
  );
  const kickerText = el("span", {}, kicker);
  const site = el(
    "div",
    {
      position: "absolute",
      right: "112px",
      top: "84px",
      font: `500 20px ${MONO}`,
      letterSpacing: "0.04em",
      color: C.ink3,
      opacity: "0.7",
    },
    stage,
  );
  site.textContent = "rementum.dev";
  const caption = el(
    "div",
    {
      position: "absolute",
      left: "50%",
      bottom: "66px",
      width: "1520px",
      transform: "translate(-50%, 0)",
      textAlign: "center",
      opacity: "0",
    },
    stage,
  );
  const capH = el(
    "div",
    { font: `600 46px/1.2 ${SANS}`, letterSpacing: "-0.02em", color: C.ink, textWrap: "balance" },
    caption,
  );
  const capS = el(
    "div",
    { marginTop: "12px", font: `400 26px/1.35 ${SANS}`, color: C.ink2 },
    caption,
  );

  const tl = createTimeline();
  const meter = txt(art, "", { kind: "mono", opacity: 0 });
  const measure = (str: string, kind: TextKind) => {
    applyTextKind(meter, kind);
    meter.textContent = str;
    return meter.getComputedTextLength();
  };
  const paintCap = (a: number) => {
    caption.style.opacity = String(a);
    caption.style.transform = `translate(-50%, ${(1 - a) * 16}px)`;
  };
  const paintKick = (a: number) => {
    kicker.style.opacity = String(a);
    kicker.style.transform = `translateY(${(1 - a) * -10}px)`;
  };
  tl.onReset(() => {
    paintCap(0);
    paintKick(0);
    setText(capH, "");
    setText(capS, "");
    setText(kickerText, "");
    site.style.opacity = "0.7";
  });
  const ctx: SceneCtx = {
    tl,
    measure,
    say(start, end, head, sub = "") {
      tl.at(
        start,
        0.5,
        (p) => {
          setText(capH, head);
          setText(capS, sub);
          capS.style.display = sub ? "" : "none";
          paintCap(p);
        },
        ease.out,
      );
      tl.at(end - 0.35, 0.35, (p) => paintCap(1 - p), ease.in);
    },
    kick(start, end, label) {
      tl.at(
        start,
        0.5,
        (p) => {
          setText(kickerText, label);
          paintKick(p);
        },
        ease.out,
      );
      tl.at(end - 0.35, 0.35, (p) => paintKick(1 - p), ease.in);
    },
    fadeSite(start) {
      tl.at(start, 0.5, (p) => {
        site.style.opacity = String(0.7 * (1 - p));
      });
    },
  };

  const fit = () => {
    stage.style.transform = `scale(${host.clientWidth / STAGE_W})`;
  };
  fit();
  const resizer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
  resizer?.observe(host);

  let disposed = false;
  let built = false;
  let playing = false;
  let frame = 0;
  // Elapsed animation time in ms; frozen while paused, so play resumes where pause stopped.
  let offset = 0;
  let origin = 0;

  const tick = (now: number) => {
    if (!playing || disposed) return;
    offset = now - origin;
    tl.seek((offset / 1000) % DURATION);
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    origin = performance.now() - offset;
    frame = requestAnimationFrame(tick);
  };

  waitForFonts(stage).then(() => {
    if (disposed) return;
    buildScenes(ctx, art);
    tl.finalize();
    built = true;
    tl.seek(offset / 1000);
    if (playing) start();
  });

  return {
    duration: DURATION,
    play() {
      if (playing || disposed) return;
      playing = true;
      if (built) start();
    },
    pause() {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(frame);
    },
    destroy() {
      disposed = true;
      playing = false;
      cancelAnimationFrame(frame);
      resizer?.disconnect();
      stage.remove();
    },
  };
}
