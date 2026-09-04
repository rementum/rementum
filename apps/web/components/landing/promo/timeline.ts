/*
 * Timeline engine for the "How it works" animation. Every frame is a pure function of the time in
 * seconds: `seek(t)` resets every element to its hidden default, applies each track whose start
 * is <= t in start order, then runs the "post" painters (blinks, slow rotations). A finished track
 * keeps applying its end state, so a later track must override anything it wants to change. That
 * is what makes seeking to an arbitrary frame safe, and what lets the loop restart cleanly.
 */

export const NS = "http://www.w3.org/2000/svg";

/* Font stacks resolve through the `next/font` variables the root layout defines. */
export const SANS = "var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif";
export const MONO = 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace';

/* Ids of the shared defs `mountPromo` creates; prefixed so they cannot collide with page SVGs. */
export const DEFS = {
  glow: "url(#rmp-glow)",
  softGlow: "url(#rmp-soft-glow)",
  tealStroke: "url(#rmp-teal-stroke)",
  tealMark: "url(#rmp-teal-mark)",
  link: "url(#rmp-link)",
} as const;

export const C = {
  canvas: "#0b1614",
  surface: "#10201d",
  surface2: "#152824",
  field: "#0d1916",
  line: "rgba(158,201,193,0.14)",
  lineStrong: "rgba(158,201,193,0.28)",
  ink: "#f3f5f1",
  ink2: "#bccbc5",
  ink3: "#87998f",
  accent: "#4aa48f",
  accentTint: "rgba(74,164,143,0.16)",
  green: "#7cc9b0",
  teal: "#5cc0a8",
  mint: "#9ec9c1",
  deep: "#2f7c68",
  amber: "#e2b45f",
  amberTint: "rgba(226,180,95,0.14)",
} as const;

export type Easing = (p: number) => number;
export const ease = {
  linear: (p: number) => p,
  out: (p: number) => 1 - (1 - p) ** 3,
  in: (p: number) => p ** 3,
  inOut: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  expo: (p: number) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  back: (p: number) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2,
} satisfies Record<string, Easing>;

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/* Text roles map to the type ramp of the rendered video, applied as presentation attributes. */
export type TextKind =
  | "label"
  | "note"
  | "mono"
  | "chip"
  | "cardTitle"
  | "coreLabel"
  | "h1"
  | "rowTitle"
  | "rowSub"
  | "body"
  | "q"
  | "tagline"
  | "links";

const TEXT: Record<TextKind, { size: number; weight?: number; mono?: boolean; tracking?: string }> =
  {
    label: { size: 22, weight: 500 },
    note: { size: 20, weight: 500 },
    mono: { size: 17, mono: true },
    chip: { size: 16, weight: 500, mono: true, tracking: "0.02em" },
    cardTitle: { size: 18, weight: 500 },
    coreLabel: { size: 30, weight: 600, tracking: "-0.02em" },
    h1: { size: 25, weight: 600, tracking: "-0.02em" },
    rowTitle: { size: 21, weight: 500 },
    rowSub: { size: 17 },
    body: { size: 19 },
    q: { size: 60, weight: 600 },
    tagline: { size: 40, weight: 500, tracking: "-0.02em" },
    links: { size: 26, mono: true },
  };

export type Attrs = Record<string, string | number>;

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent: Element | null = null,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (parent) parent.appendChild(node);
  return node;
}

export function applyTextKind(node: SVGTextElement, kind: TextKind) {
  const spec = TEXT[kind];
  node.setAttribute("font-size", String(spec.size));
  node.setAttribute("font-weight", String(spec.weight ?? 400));
  node.setAttribute("letter-spacing", spec.tracking ?? "0");
  node.style.fontFamily = spec.mono ? MONO : SANS;
}

export function txt(
  parent: Element,
  content: string,
  attrs: Attrs & { kind: TextKind },
): SVGTextElement {
  const { kind, ...rest } = attrs;
  const node = svg("text", rest, parent);
  applyTextKind(node, kind);
  node.textContent = content;
  return node;
}

export interface ItemState {
  x: number;
  y: number;
  s: number;
  r: number;
  o: number;
}

export interface Item {
  node: SVGGraphicsElement;
  def: ItemState;
  st: ItemState;
  /** Set for cards whose laid-out width other items align to. */
  width?: number;
  set(patch: Partial<ItemState>): Item;
}

export interface Track {
  start: number;
  dur: number;
  fn: (p: number, elapsed: number, t: number) => void;
  easing: Easing;
}

export interface Timeline {
  at(start: number, dur: number, fn: Track["fn"], easing?: Easing): void;
  onReset(fn: () => void): void;
  post(fn: (t: number) => void): void;
  item(node: SVGGraphicsElement, base?: Partial<ItemState>): Item;
  tw(
    it: Item,
    start: number,
    dur: number,
    to: Partial<ItemState>,
    from?: Partial<ItemState>,
    easing?: Easing,
  ): void;
  show(it: Item, start: number, dur?: number): void;
  hide(it: Item, start: number, dur?: number): void;
  pop(it: Item, start: number, dur?: number, from?: number): void;
  strokePath(d: string, attrs: Attrs, parent: Element): SVGPathElement;
  draw(path: SVGPathElement, start: number, dur: number, easing?: Easing): void;
  flow(
    path: SVGPathElement,
    dot: Item,
    start: number,
    dur: number,
    opts?: { reverse?: boolean; loops?: number },
  ): void;
  /** Sorts tracks by start; call once after every scene is built and before the first seek. */
  finalize(): void;
  seek(t: number): void;
}

export function createTimeline(): Timeline {
  const resets: Array<() => void> = [];
  const tracks: Track[] = [];
  const posts: Array<(t: number) => void> = [];
  const lengths = new WeakMap<SVGPathElement, number>();

  const at: Timeline["at"] = (start, dur, fn, easing = ease.expo) => {
    tracks.push({ start, dur, fn, easing });
  };

  const item: Timeline["item"] = (node, base = {}) => {
    const def: ItemState = { x: 0, y: 0, s: 1, r: 0, o: 0, ...base };
    // Attribute writes are the cost of a seek, and most items do not move between frames.
    let lastTransform = "";
    let lastOpacity = "";
    const it: Item = {
      node,
      def,
      st: { ...def },
      set(patch) {
        Object.assign(it.st, patch);
        const { x, y, s, r, o } = it.st;
        const transform = `translate(${x} ${y}) rotate(${r}) scale(${s})`;
        if (transform !== lastTransform) {
          node.setAttribute("transform", transform);
          lastTransform = transform;
        }
        const opacity = String(o);
        if (opacity !== lastOpacity) {
          node.setAttribute("opacity", opacity);
          lastOpacity = opacity;
        }
        return it;
      },
    };
    resets.push(() => it.set({ ...def }));
    it.set({});
    return it;
  };

  const tw: Timeline["tw"] = (it, start, dur, to, from = {}, easing) => {
    const keys = Object.keys(to) as Array<keyof ItemState>;
    at(
      start,
      dur,
      (p) => {
        const next: Partial<ItemState> = {};
        for (const key of keys) next[key] = lerp(from[key] ?? it.st[key], to[key] ?? 0, p);
        it.set(next);
      },
      easing,
    );
  };

  const show: Timeline["show"] = (it, start, dur = 0.5) =>
    tw(it, start, dur, { o: 1 }, { o: 0 }, ease.out);
  const hide: Timeline["hide"] = (it, start, dur = 0.4) =>
    tw(it, start, dur, { o: 0 }, {}, ease.out);
  const pop: Timeline["pop"] = (it, start, dur = 0.6, from = 0.7) => {
    tw(it, start, dur, { o: 1 }, { o: 0 }, ease.out);
    tw(it, start, dur, { s: it.def.s }, { s: from * it.def.s }, ease.back);
  };

  const strokePath: Timeline["strokePath"] = (d, attrs, parent) => {
    const path = svg("path", { d, fill: "none", ...attrs }, parent);
    const length = path.getTotalLength();
    lengths.set(path, length);
    path.style.strokeDasharray = `${length} ${length}`;
    resets.push(() => {
      path.style.strokeDashoffset = String(length);
    });
    return path;
  };

  const draw: Timeline["draw"] = (path, start, dur, easing = ease.inOut) => {
    const length = lengths.get(path) ?? 0;
    at(
      start,
      dur,
      (p) => {
        path.style.strokeDashoffset = String(length * (1 - p));
      },
      easing,
    );
  };

  const flow: Timeline["flow"] = (path, dot, start, dur, { reverse = false, loops = 1 } = {}) => {
    const length = lengths.get(path) ?? 0;
    at(
      start,
      dur,
      (p) => {
        const q = (p * loops) % 1;
        const point = path.getPointAtLength(length * (reverse ? 1 - q : q));
        const fade = Math.min(1, q * 8, (1 - q) * 8);
        dot.set({ x: point.x, y: point.y, o: p >= 1 ? 0 : fade });
      },
      ease.linear,
    );
  };

  return {
    at,
    onReset: (fn) => {
      resets.push(fn);
    },
    post: (fn) => {
      posts.push(fn);
    },
    item,
    tw,
    show,
    hide,
    pop,
    strokePath,
    draw,
    flow,
    finalize() {
      tracks.sort((a, b) => a.start - b.start);
    },
    seek(t) {
      for (const reset of resets) reset();
      for (const track of tracks) {
        if (t < track.start) continue;
        const p = track.dur > 0 ? Math.min(1, (t - track.start) / track.dur) : 1;
        track.fn(track.easing(p), t - track.start, t);
      }
      for (const post of posts) post(t);
    },
  };
}
