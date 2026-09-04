/*
 * Illustration parts for the "How it works" animation: robots, speech bubbles, chips, cards,
 * stations. Each is built once into the SVG and returns the `Item` (or items) the scenes animate.
 */

import { BRAND_LAYERS_PATH, BRAND_LETTER_PATH } from "../../brand-paths";
import {
  C,
  DEFS,
  ease,
  type Item,
  type ItemState,
  svg,
  type TextKind,
  type Timeline,
  txt,
} from "./timeline";

export interface Ctx {
  tl: Timeline;
  /** Rendered width of a string in a text role; chips and bubbles size themselves from it. */
  measure(str: string, kind: TextKind): number;
}

export interface Agent {
  name: string;
  color: string;
}

export const AGENTS: readonly Agent[] = [
  { name: "Claude Code", color: "#4aa48f" },
  { name: "Cursor", color: "#9ec9c1" },
  { name: "Codex", color: "#7cc9b0" },
];
export const NOTES = ["Task queue → Postgres", "Auth header: X-Api-Key", "Retry limit is 3"];

type Pos = Partial<ItemState>;

export interface Bot {
  it: Item;
  awake: boolean;
}

export function makeBot(
  ctx: Ctx,
  parent: Element,
  { name, color }: Agent,
  pos: Pos,
  seed: number,
): Bot {
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0 });
  svg(
    "rect",
    {
      x: -82,
      y: -66,
      width: 164,
      height: 132,
      rx: 32,
      fill: C.surface2,
      stroke: C.lineStrong,
      "stroke-width": 2,
    },
    g,
  );
  svg("rect", { x: -64, y: -50, width: 128, height: 88, rx: 20, fill: C.field }, g);
  const eyes = [
    svg("rect", { x: -36, y: -26, width: 18, height: 30, rx: 8, fill: color }, g),
    svg("rect", { x: 18, y: -26, width: 18, height: 30, rx: 8, fill: color }, g),
  ];
  const mouth = svg("rect", { x: -36, y: 16, width: 26, height: 6, rx: 3, fill: color }, g);
  svg("rect", { x: -4, y: -92, width: 8, height: 28, rx: 4, fill: C.ink3 }, g);
  const lamp = svg("circle", { cx: 0, cy: -100, r: 9, fill: color }, g);
  const halo = svg("circle", { cx: 0, cy: -100, r: 18, fill: color, filter: DEFS.softGlow }, g);
  svg(
    "rect",
    {
      x: -40,
      y: 68,
      width: 80,
      height: 12,
      rx: 6,
      fill: C.surface2,
      stroke: C.lineStrong,
      "stroke-width": 2,
    },
    g,
  );
  txt(g, name, { y: 116, "text-anchor": "middle", kind: "label", fill: C.ink2 });
  const bot: Bot = { it, awake: true };
  ctx.tl.onReset(() => {
    bot.awake = true;
  });
  ctx.tl.post((t) => {
    const phase = (t + seed) % 3.9;
    const blink = phase < 0.16 ? 1 - 0.85 * Math.sin((Math.PI * phase) / 0.16) : 1;
    const sy = bot.awake ? blink : 0.12;
    for (const eye of eyes) {
      const cx = Number(eye.getAttribute("x")) + 9;
      eye.setAttribute("transform", `translate(${cx} -11) scale(1 ${sy}) translate(${-cx} 11)`);
    }
    lamp.setAttribute("opacity", bot.awake ? "1" : "0.25");
    halo.setAttribute("opacity", bot.awake ? "0.45" : "0");
    mouth.setAttribute("opacity", bot.awake ? "0.9" : "0.3");
  });
  return bot;
}

export const sleep = (ctx: Ctx, bot: Bot, start: number) =>
  ctx.tl.at(start, 0, () => {
    bot.awake = false;
  });
export const wake = (ctx: Ctx, bot: Bot, start: number) =>
  ctx.tl.at(start, 0, () => {
    bot.awake = true;
  });

export function makeBubble(ctx: Ctx, parent: Element, str: string, pos: Pos): Item {
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0 });
  const w = ctx.measure(str, "note") + 56;
  const h = 54;
  svg(
    "rect",
    {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: 16,
      fill: C.surface,
      stroke: C.lineStrong,
      "stroke-width": 2,
    },
    g,
  );
  svg(
    "path",
    {
      d: `M -11 ${h / 2 - 1} L 0 ${h / 2 + 13} L 11 ${h / 2 - 1} Z`,
      fill: C.surface,
      stroke: C.lineStrong,
      "stroke-width": 2,
      "stroke-linejoin": "round",
    },
    g,
  );
  svg("rect", { x: -12, y: h / 2 - 4, width: 24, height: 5, fill: C.surface }, g);
  svg("circle", { cx: -w / 2 + 22, cy: 0, r: 5, fill: C.accent }, g);
  txt(g, str, {
    x: 11,
    y: 1,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    kind: "note",
    fill: C.ink,
  });
  return it;
}

export interface ChipOpts {
  kind?: TextKind;
  fill?: string;
  stroke?: string;
  color?: string;
  dot?: boolean;
  dashed?: boolean;
}

export function makeChip(
  ctx: Ctx,
  parent: Element,
  str: string,
  pos: Pos,
  opts: ChipOpts = {},
): Item {
  const {
    kind = "chip",
    fill = C.accentTint,
    stroke = C.accent,
    color = C.green,
    dot = true,
    dashed = false,
  } = opts;
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0 });
  const w = ctx.measure(str, kind) + (dot ? 54 : 34);
  const h = 40;
  svg(
    "rect",
    {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: h / 2,
      fill,
      stroke,
      "stroke-width": 1.5,
      ...(dashed ? { "stroke-dasharray": "6 6" } : {}),
    },
    g,
  );
  if (dot) svg("circle", { cx: -w / 2 + 19, cy: 0, r: 4.5, fill: color }, g);
  txt(g, str, {
    x: dot ? 10 : 0,
    y: 1,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    kind,
    fill: color,
  });
  return it;
}

export function makeCross(ctx: Ctx, parent: Element, pos: Pos, color: string = C.amber): Item {
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0 });
  svg("circle", { r: 20, fill: C.field, stroke: color, "stroke-width": 2 }, g);
  svg(
    "path",
    {
      d: "M -7 -7 L 7 7 M 7 -7 L -7 7",
      stroke: color,
      "stroke-width": 3.5,
      "stroke-linecap": "round",
    },
    g,
  );
  return it;
}

export function makeCore(ctx: Ctx, parent: Element, pos: Pos): Item {
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0 });
  svg(
    "rect",
    {
      x: -150,
      y: -150,
      width: 300,
      height: 300,
      rx: 70,
      fill: C.accent,
      opacity: 0.32,
      filter: DEFS.glow,
    },
    g,
  );
  const ring = svg(
    "circle",
    { r: 180, fill: "none", stroke: C.lineStrong, "stroke-width": 2, "stroke-dasharray": "5 15" },
    g,
  );
  ctx.tl.post((t) => ring.setAttribute("transform", `rotate(${t * 8})`));
  svg(
    "rect",
    {
      x: -140,
      y: -140,
      width: 280,
      height: 280,
      rx: 64,
      fill: C.surface,
      stroke: DEFS.tealStroke,
      "stroke-width": 3,
    },
    g,
  );
  const mark = svg("g", { transform: "translate(-80 -69) scale(0.223)" }, g);
  svg("path", { d: BRAND_LAYERS_PATH, fill: DEFS.tealMark }, mark);
  svg("path", { d: BRAND_LETTER_PATH, fill: C.ink }, mark);
  txt(g, "Rementum", { y: 192, "text-anchor": "middle", kind: "coreLabel", fill: C.ink });
  txt(g, "one shared brain", { y: 226, "text-anchor": "middle", kind: "mono", fill: C.ink3 });
  return it;
}

export interface CardOpts {
  version?: string;
  scale?: number;
  lines?: number[];
}

export function makeCard(
  ctx: Ctx,
  parent: Element,
  title: string,
  pos: Pos,
  opts: CardOpts = {},
): Item {
  const { version = "v1", scale = 1, lines = [0.72, 0.5, 0.62] } = opts;
  const w = Math.max(236, ctx.measure(title, "cardTitle") + 64);
  const h = 128;
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0, s: scale });
  svg(
    "rect",
    {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: 18,
      fill: C.surface,
      stroke: C.lineStrong,
      "stroke-width": 2,
    },
    g,
  );
  svg("circle", { cx: -w / 2 + 22, cy: -h / 2 + 27, r: 5, fill: C.accent }, g);
  txt(g, title, {
    x: -w / 2 + 36,
    y: -h / 2 + 28,
    "dominant-baseline": "central",
    kind: "cardTitle",
    fill: C.ink,
  });
  for (const [i, frac] of lines.entries()) {
    svg(
      "rect",
      {
        x: -w / 2 + 22,
        y: -h / 2 + 52 + i * 17,
        width: (w - 44) * frac,
        height: 7,
        rx: 3.5,
        fill: C.lineStrong,
      },
      g,
    );
  }
  svg(
    "rect",
    {
      x: w / 2 - 58,
      y: h / 2 - 36,
      width: 40,
      height: 24,
      rx: 12,
      fill: C.accentTint,
      stroke: C.accent,
      "stroke-width": 1,
    },
    g,
  );
  txt(g, version, {
    x: w / 2 - 38,
    y: h / 2 - 23,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    kind: "chip",
    fill: C.green,
  });
  it.width = w * scale;
  return it;
}

export interface Proposal {
  it: Item;
  conflict(start: number, dur: number): void;
}

export function makeProposal(ctx: Ctx, parent: Element, title: string, pos: Pos): Proposal {
  const w = Math.max(262, ctx.measure(title, "cardTitle") + 40);
  const h = 124;
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0 });
  svg(
    "rect",
    {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: 18,
      fill: C.surface,
      stroke: C.accent,
      "stroke-width": 2,
    },
    g,
  );
  txt(g, title, {
    x: -w / 2 + 20,
    y: -h / 2 + 30,
    "dominant-baseline": "central",
    kind: "cardTitle",
    fill: C.ink,
  });
  txt(g, "base: v3", {
    x: -w / 2 + 20,
    y: -h / 2 + 62,
    "dominant-baseline": "central",
    kind: "mono",
    fill: C.ink3,
  });
  const status = txt(g, "status: staged", {
    x: -w / 2 + 20,
    y: -h / 2 + 90,
    "dominant-baseline": "central",
    kind: "mono",
    fill: C.green,
  });
  const tint = svg(
    "rect",
    {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: 18,
      fill: C.amberTint,
      stroke: C.amber,
      "stroke-width": 2,
      opacity: 0,
    },
    g,
  );
  ctx.tl.onReset(() => {
    tint.setAttribute("opacity", "0");
    status.textContent = "status: staged";
    status.setAttribute("fill", C.green);
  });
  return {
    it,
    conflict(start, dur) {
      ctx.tl.at(start, dur, (p) => {
        tint.setAttribute("opacity", String(p));
        status.textContent = "status: conflicted";
        status.setAttribute("fill", C.amber);
      });
    },
  };
}

export interface Station {
  it: Item;
  g: SVGGElement;
}

export function makeStation(
  ctx: Ctx,
  parent: Element,
  {
    x,
    y,
    w,
    h,
    title,
    sub,
  }: { x: number; y: number; w: number; h: number; title: string; sub: string },
): Station {
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { x, y, o: 0 });
  svg(
    "rect",
    {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: 26,
      fill: "rgba(16,32,29,0.85)",
      stroke: C.line,
      "stroke-width": 2,
    },
    g,
  );
  txt(g, title, { x: -w / 2 + 30, y: -h / 2 + 46, kind: "h1", fill: C.ink });
  txt(g, sub, { x: -w / 2 + 30, y: -h / 2 + 78, kind: "mono", fill: C.ink3 });
  return { it, g };
}

export function makeCheckBadge(ctx: Ctx, parent: Element, pos: Pos, ok: boolean): Item {
  const color = ok ? C.green : C.amber;
  const g = svg("g", {}, parent);
  const it = ctx.tl.item(g, { ...pos, o: 0 });
  svg(
    "circle",
    { r: 30, fill: ok ? C.accentTint : C.amberTint, stroke: color, "stroke-width": 2.5 },
    g,
  );
  svg(
    "path",
    {
      d: ok ? "M -13 1 L -4 10 L 14 -10" : "M -9 -9 L 9 9 M 9 -9 L -9 9",
      stroke: color,
      "stroke-width": 4,
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    g,
  );
  return it;
}

export function makePulse(ctx: Ctx, parent: Element, pos: Pos, color: string) {
  const it = ctx.tl.item(
    svg("circle", { r: 30, fill: "none", stroke: color, "stroke-width": 3 }, parent),
    { ...pos, o: 0 },
  );
  return {
    fire(start: number) {
      ctx.tl.tw(it, start, 0.9, { s: 2.6, o: 0 }, { s: 1, o: 0.8 }, ease.out);
    },
  };
}

/**
 * Lays items out on one row from their rendered widths, because chip widths follow their text.
 * `origin` is the left edge for "start" or the centre of the whole row for "center".
 */
export function placeRow(row: Item[], origin: number, gap: number, align: "start" | "center") {
  const widths = row.map((it) => it.node.getBBox().width);
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (row.length - 1);
  let cursor = align === "center" ? origin - total / 2 : origin;
  for (const [i, it] of row.entries()) {
    const width = widths[i] ?? 0;
    const x = cursor + width / 2;
    cursor += width + gap;
    it.def.x = x;
    it.set({ x });
  }
}

/** Same as `placeRow`, but measured from each chip's pill rather than its whole group. */
export function placeChips(row: Item[], centre: number, gap: number) {
  const widths = row.map((it) => it.node.querySelector("rect")?.getBBox().width ?? 0);
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (row.length - 1);
  let cursor = centre - total / 2;
  for (const [i, it] of row.entries()) {
    const width = widths[i] ?? 0;
    const x = cursor + width / 2;
    cursor += width + gap;
    it.def.x = x;
    it.set({ x });
  }
}
