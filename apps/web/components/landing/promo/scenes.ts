/*
 * The five scenes of the "How it works" animation, in absolute seconds on one 44.5 s loop:
 * the problem (0), one shared brain (7.6), reading (14.4), writing safely (22.4),
 * shared everywhere (34.0), and the closing lockup (39.2). Timings match the rendered video.
 */

import {
  BRAND_LAYERS_PATH,
  BRAND_LETTER_PATH,
  BRAND_WORDMARK_PATH,
  BRAND_WORDMARK_TRANSFORM,
} from "../../brand-paths";
import {
  AGENTS,
  type Ctx,
  makeBot,
  makeBubble,
  makeCard,
  makeCheckBadge,
  makeChip,
  makeCore,
  makeCross,
  makeProposal,
  makePulse,
  makeStation,
  placeChips,
  placeRow,
  sleep,
  wake,
} from "./parts";
import { C, DEFS, ease, type Item, svg, txt } from "./timeline";

export const DURATION = 44.5;

export interface SceneCtx extends Ctx {
  /** Caption at the bottom of the stage, faded in at `start` and out by `end`. */
  say(start: number, end: number, head: string, sub?: string): void;
  /** Scene label at the top left, faded in at `start` and out by `end`. */
  kick(start: number, end: number, label: string): void;
  /** Fades the site address in the corner out, for the closing lockup. */
  fadeSite(start: number): void;
}

function buildWorld(ctx: SceneCtx, gWorld: Item) {
  const { tl } = ctx;
  const g = gWorld.node;
  const S1 = 0;
  const S2 = 7.6;
  const S5 = 34.0;
  const S6 = 39.2;
  const columnX = [560, 960, 1360];
  const bots = AGENTS.map((agent, i) =>
    makeBot(ctx, g, agent, { x: columnX[i], y: 540 }, i * 1.37),
  );
  const bubbles = ctx.p.notes.map((note, i) => makeBubble(ctx, g, note, { x: columnX[i], y: 336 }));
  const marks = columnX.map((x) =>
    tl.item(
      txt(g, "?", {
        "text-anchor": "middle",
        "dominant-baseline": "central",
        kind: "q",
        fill: C.ink3,
      }),
      { x, y: 340, o: 0 },
    ),
  );
  const gaps = ["M 650 540 L 870 540", "M 1050 540 L 1270 540"].map((d) =>
    tl.item(
      svg(
        "path",
        {
          d,
          stroke: C.ink3,
          "stroke-width": 3,
          "stroke-dasharray": "10 12",
          "stroke-linecap": "round",
          fill: "none",
        },
        g,
      ),
      { o: 0 },
    ),
  );
  const crosses = [makeCross(ctx, g, { x: 760, y: 540 }), makeCross(ctx, g, { x: 1160, y: 540 })];

  // Scene 1: every agent keeps its own notes, then loses them.
  ctx.kick(S1 + 0.2, S1 + 7.3, ctx.p.kick.problem);
  for (const [i, bot] of bots.entries()) {
    tl.tw(bot.it, S1 + 0.2 + i * 0.15, 0.7, { o: 1, y: 540 }, { o: 0, y: 580 }, ease.out);
    tl.tw(bot.it, S1 + 0.2 + i * 0.15, 0.7, { s: 1 }, { s: 0.7 }, ease.back);
  }
  ctx.say(S1 + 0.7, S1 + 3.6, ctx.p.say.ownNotes);
  for (const [i, bubble] of bubbles.entries()) tl.pop(bubble, S1 + 1.5 + i * 0.2, 0.55, 0.6);
  ctx.say(S1 + 3.8, S1 + 5.9, ctx.p.say.sessionEnds);
  for (const [i, bubble] of bubbles.entries()) {
    tl.tw(bubble, S1 + 3.9 + i * 0.1, 0.7, { o: 0, y: 300, s: 0.85 }, {}, ease.out);
  }
  for (const bot of bots) sleep(ctx, bot, S1 + 4.1);
  for (const bot of bots) wake(ctx, bot, S1 + 5.2);
  for (const [i, mark] of marks.entries()) tl.pop(mark, S1 + 5.25 + i * 0.12, 0.5, 0.5);
  ctx.say(S1 + 6.1, S1 + 7.7, ctx.p.say.nothingShared);
  for (const [i, gap] of gaps.entries()) tl.show(gap, S1 + 6.2 + i * 0.1, 0.4);
  for (const [i, cross] of crosses.entries()) tl.pop(cross, S1 + 6.7 + i * 0.12, 0.4, 0.4);

  // Scene 2: the agents gather around one shared brain.
  const worldPos = [
    { x: 420, y: 310 },
    { x: 420, y: 540 },
    { x: 420, y: 770 },
  ];
  ctx.kick(S2 + 0.2, S2 + 6.7, ctx.p.kick.sharedBrain);
  for (const mark of marks) tl.hide(mark, S2 - 0.1, 0.3);
  for (const cross of crosses) tl.hide(cross, S2 - 0.1, 0.3);
  for (const gap of gaps) tl.hide(gap, S2 - 0.1, 0.3);
  for (const [i, bot] of bots.entries()) {
    tl.tw(bot.it, S2 + 0.1 + i * 0.08, 0.9, { ...worldPos[i], s: 0.72 }, {}, ease.inOut);
  }
  const core = makeCore(ctx, g, { x: 1180, y: 540 });
  tl.pop(core, S2 + 0.7, 0.8, 0.6);
  ctx.say(S2 + 0.9, S2 + 4.0, ctx.p.say.oneBrain);
  const links = worldPos.map((pos) =>
    tl.strokePath(
      `M 478 ${pos.y} C 720 ${pos.y} 800 540 1036 540`,
      { stroke: DEFS.link, "stroke-width": 3, "stroke-linecap": "round", opacity: 0.9 },
      g,
    ),
  );
  for (const [i, link] of links.entries()) tl.draw(link, S2 + 1.4 + i * 0.15, 0.8);
  const mcp = makeChip(
    ctx,
    g,
    "MCP",
    { x: 760, y: 540 },
    { dot: false, fill: C.surface, stroke: C.lineStrong, color: C.ink2 },
  );
  tl.pop(mcp, S2 + 2.2, 0.45, 0.6);
  const packets = links.map(() =>
    tl.item(svg("circle", { r: 7, fill: C.mint, filter: DEFS.softGlow }, g), { o: 0 }),
  );
  const packetDots = links.map(() => tl.item(svg("circle", { r: 5, fill: C.mint }, g), { o: 0 }));
  for (const [i, link] of links.entries()) {
    const packet = packets[i];
    const dot = packetDots[i];
    if (!packet || !dot) continue;
    tl.flow(link, packet, S2 + 2.4 + i * 0.25, 2.4, { loops: 2 });
    tl.flow(link, dot, S2 + 2.4 + i * 0.25, 2.4, { loops: 2 });
  }
  const cards = ctx.p.notes.map((note, i) =>
    makeCard(ctx, g, note, { x: 1180, y: 540 }, { version: `v${i + 1}`, scale: 0.8 }),
  );
  ctx.say(S2 + 4.2, S2 + 6.8, ctx.p.say.markdown, ctx.p.say.markdownSub);
  for (const [i, card] of cards.entries()) {
    tl.tw(
      card,
      S2 + 4.3 + i * 0.12,
      0.8,
      { x: 1452 + (card.width ?? 0) / 2, y: 416 + i * 124, o: 1 },
      { x: 1180, y: 540, o: 0 },
      ease.out,
    );
  }
  tl.hide(gWorld, S2 + 6.8, 0.45);

  // Scene 5: the same knowledge reaches every agent.
  tl.tw(gWorld, S5 + 0.1, 0.5, { o: 1 }, { o: 0 }, ease.out);
  ctx.kick(S5 + 0.2, S5 + 5.1, ctx.p.kick.everywhere);
  ctx.say(S5 + 0.6, S5 + 5.1, ctx.p.say.everyAgent);
  const back = links.map(() =>
    tl.item(svg("circle", { r: 7, fill: C.mint, filter: DEFS.softGlow }, g), { o: 0 }),
  );
  for (const [i, link] of links.entries()) {
    const dot = back[i];
    if (dot) tl.flow(link, dot, S5 + 0.6 + i * 0.15, 1.1, { reverse: true });
  }
  const shared = worldPos.map((pos) =>
    makeChip(ctx, g, ctx.p.sharedChip, { x: pos.x, y: pos.y + 122 }),
  );
  for (const [i, chip] of shared.entries()) tl.pop(chip, S5 + 1.5 + i * 0.15, 0.5, 0.6);
  const badges = ctx.p.badges.map((label) =>
    makeChip(
      ctx,
      g,
      label,
      { x: 0, y: 830 },
      { fill: C.surface, stroke: C.lineStrong, color: C.ink2 },
    ),
  );
  placeChips(badges, 1180, 24);
  for (const [i, badge] of badges.entries()) tl.pop(badge, S5 + 2.4 + i * 0.15, 0.5, 0.6);
  tl.hide(gWorld, S6 - 0.5, 0.45);
}

function buildRead(ctx: SceneCtx, gRead: Item) {
  const { tl } = ctx;
  const g = gRead.node;
  const S3 = 14.4;
  const S4 = 22.4;
  tl.tw(gRead, S3 + 0.1, 0.5, { o: 1 }, { o: 0 }, ease.out);
  ctx.kick(S3 + 0.2, S4 - 0.3, ctx.p.kick.reading);
  const agent = AGENTS[0];
  if (!agent) return;
  const bot = makeBot(ctx, g, agent, { x: 330, y: 540, s: 0.9 }, 0.4);
  tl.tw(bot.it, S3 + 0.2, 0.7, { o: 1 }, { o: 0 }, ease.out);
  ctx.say(S3 + 0.6, S3 + 3.8, ctx.p.say.neverLoads);

  const panel = svg("g", {}, g);
  const panelIt = tl.item(panel, { x: 830, y: 540, o: 0 });
  const pw = 540;
  const ph = 500;
  svg(
    "rect",
    {
      x: -pw / 2,
      y: -ph / 2,
      width: pw,
      height: ph,
      rx: 26,
      fill: "rgba(16,32,29,0.85)",
      stroke: C.line,
      "stroke-width": 2,
    },
    panel,
  );
  svg("circle", { cx: -pw / 2 + 32, cy: -ph / 2 + 34, r: 5, fill: C.accent }, panel);
  txt(panel, ctx.p.read.panelTitle, {
    x: -pw / 2 + 48,
    y: -ph / 2 + 35,
    "dominant-baseline": "central",
    kind: "mono",
    fill: C.ink2,
  });
  txt(panel, ctx.p.read.panelCount, {
    x: pw / 2 - 30,
    y: -ph / 2 + 35,
    "text-anchor": "end",
    "dominant-baseline": "central",
    kind: "mono",
    fill: C.ink3,
  });
  svg(
    "line",
    {
      x1: -pw / 2,
      y1: -ph / 2 + 64,
      x2: pw / 2,
      y2: -ph / 2 + 64,
      stroke: C.line,
      "stroke-width": 2,
    },
    panel,
  );
  const rows = ctx.p.read.rows.map((row) => [row.title, row.sub] as [string, string]);
  const rowTop = -ph / 2 + 84;
  const rowH = 68;
  const highlight = tl.item(
    svg(
      "rect",
      {
        x: -pw / 2 + 18,
        y: -30,
        width: pw - 36,
        height: 62,
        rx: 14,
        fill: C.accentTint,
        stroke: C.accent,
        "stroke-width": 1.5,
      },
      panel,
    ),
    { x: 0, y: rowTop + 31, o: 0 },
  );
  const rowItems = rows.map(([title, sub], i) => {
    const row = svg("g", {}, panel);
    txt(row, title, { x: -pw / 2 + 36, y: rowTop + i * rowH + 24, kind: "rowTitle", fill: C.ink });
    txt(row, sub, { x: -pw / 2 + 36, y: rowTop + i * rowH + 50, kind: "rowSub", fill: C.ink3 });
    return tl.item(row, { o: 0 });
  });
  const request = tl.strokePath(
    "M 410 540 L 556 540",
    { stroke: C.deep, "stroke-width": 3, "stroke-linecap": "round" },
    g,
  );
  const reqDot = tl.item(svg("circle", { r: 7, fill: C.mint, filter: DEFS.softGlow }, g), { o: 0 });
  tl.draw(request, S3 + 1.0, 0.5);
  tl.flow(request, reqDot, S3 + 1.0, 0.6);
  tl.tw(panelIt, S3 + 1.3, 0.7, { o: 1, x: 830 }, { o: 0, x: 860 }, ease.out);
  for (const [i, row] of rowItems.entries()) {
    tl.tw(row, S3 + 1.7 + i * 0.1, 0.45, { o: 1 }, { o: 0 }, ease.out);
  }
  const tagLoad = makeChip(
    ctx,
    g,
    "load_context",
    { x: 830, y: 836 },
    { fill: C.surface, stroke: C.lineStrong, color: C.ink2 },
  );
  tl.pop(tagLoad, S3 + 1.6, 0.5, 0.6);

  // The highlight sweeps the index and settles on the one article that answers the question.
  tl.at(
    S3 + 2.7,
    1.2,
    (p) => highlight.set({ o: Math.min(1, p * 6), y: rowTop + 31 + rowH * 2 * p }),
    ease.inOut,
  );
  ctx.say(S3 + 3.9, S4 - 0.3, ctx.p.say.compactIndex);

  const card = svg("g", {}, g);
  const cardIt = tl.item(card, { x: 830, y: rowTop + 540 + rowH * 2 + 31, s: 0.3, o: 0 });
  const cw = 480;
  const ch = 480;
  svg(
    "rect",
    {
      x: -cw / 2 - 10,
      y: -ch / 2 - 10,
      width: cw + 20,
      height: ch + 20,
      rx: 36,
      fill: C.accent,
      opacity: 0.18,
      filter: DEFS.glow,
    },
    card,
  );
  svg(
    "rect",
    {
      x: -cw / 2,
      y: -ch / 2,
      width: cw,
      height: ch,
      rx: 26,
      fill: C.surface,
      stroke: C.accent,
      "stroke-width": 2,
    },
    card,
  );
  txt(card, ctx.p.articleTitle, {
    x: -cw / 2 + 34,
    y: -ch / 2 + 54,
    kind: "h1",
    fill: C.ink,
  });
  txt(card, ctx.p.read.cardMeta, {
    x: -cw / 2 + 34,
    y: -ch / 2 + 88,
    kind: "mono",
    fill: C.ink3,
  });
  svg(
    "line",
    {
      x1: -cw / 2 + 34,
      y1: -ch / 2 + 112,
      x2: cw / 2 - 34,
      y2: -ch / 2 + 112,
      stroke: C.line,
      "stroke-width": 2,
    },
    card,
  );
  const bodyLines = ctx.p.read.body.map((row) => [row.label, row.line] as [string, string]);
  const bodyItems = bodyLines.map(([label, line], i) => {
    const row = svg("g", {}, card);
    const y = -ch / 2 + 156 + i * 78;
    txt(row, label, { x: -cw / 2 + 34, y, kind: "mono", fill: C.green });
    txt(row, line, { x: -cw / 2 + 34, y: y + 32, kind: "body", fill: C.ink2 });
    return tl.item(row, { o: 0 });
  });
  const footChips = ctx.p.read.footChips.map((label) =>
    makeChip(
      ctx,
      card,
      label,
      { x: 0, y: ch / 2 - 44 },
      { fill: C.field, stroke: C.lineStrong, color: C.ink3 },
    ),
  );
  placeRow(footChips, -cw / 2 + 34, 12, "start");
  tl.tw(cardIt, S3 + 4.0, 0.9, { x: 1460, y: 540, s: 1, o: 1 }, {}, ease.out);
  for (const [i, row] of bodyItems.entries()) {
    tl.tw(row, S3 + 4.7 + i * 0.18, 0.5, { o: 1 }, { o: 0 }, ease.out);
  }
  for (const [i, chip] of footChips.entries()) tl.pop(chip, S3 + 5.4 + i * 0.1, 0.4, 0.6);
  const tagRead = makeChip(
    ctx,
    g,
    "read_article",
    { x: 1460, y: 836 },
    { fill: C.surface, stroke: C.lineStrong, color: C.ink2 },
  );
  tl.pop(tagRead, S3 + 4.5, 0.5, 0.6);
  tl.hide(gRead, S4 - 0.45, 0.4);
}

function buildWrite(ctx: SceneCtx, gWrite: Item) {
  const { tl } = ctx;
  const g = gWrite.node;
  const S4 = 22.4;
  const S5 = 34.0;
  tl.tw(gWrite, S4 + 0.1, 0.5, { o: 1 }, { o: 0 }, ease.out);
  ctx.kick(S4 + 0.2, S5 - 0.3, ctx.p.kick.writing);
  const [claude, cursor] = AGENTS;
  if (!claude || !cursor) return;
  const writer = makeBot(ctx, g, claude, { x: 300, y: 420, s: 0.78 }, 0.9);
  const rival = makeBot(ctx, g, cursor, { x: 300, y: 700, s: 0.78 }, 2.1);
  tl.tw(writer.it, S4 + 0.2, 0.7, { o: 1 }, { o: 0 }, ease.out);
  tl.tw(rival.it, S4 + 0.35, 0.7, { o: 1 }, { o: 0 }, ease.out);
  const stations = [
    makeStation(ctx, g, {
      x: 730,
      y: 530,
      w: 340,
      h: 400,
      title: ctx.p.write.stationTitles[0] ?? "",
      sub: "stage_write",
    }),
    makeStation(ctx, g, {
      x: 1140,
      y: 530,
      w: 340,
      h: 400,
      title: ctx.p.write.stationTitles[1] ?? "",
      sub: ctx.p.write.conflictSub,
    }),
    makeStation(ctx, g, {
      x: 1550,
      y: 530,
      w: 340,
      h: 400,
      title: ctx.p.write.stationTitles[2] ?? "",
      sub: "promote_staged_write",
    }),
  ];
  for (const [i, station] of stations.entries()) {
    tl.tw(station.it, S4 + 0.3 + i * 0.15, 0.6, { o: 1, y: 530 }, { o: 0, y: 550 }, ease.out);
  }
  const chevrons = [935, 1345].map((x) =>
    tl.item(
      svg(
        "path",
        {
          d: `M ${x - 8} 518 L ${x + 6} 530 L ${x - 8} 542`,
          stroke: C.ink3,
          "stroke-width": 3,
          fill: "none",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        g,
      ),
      { o: 0 },
    ),
  );
  for (const [i, chevron] of chevrons.entries()) {
    tl.tw(chevron, S4 + 0.8 + i * 0.15, 0.4, { o: 1 }, { o: 0 }, ease.out);
  }

  // Station internals.
  const slotY = 494;
  svg(
    "rect",
    {
      x: 730 - 131,
      y: slotY - 62,
      width: 262,
      height: 124,
      rx: 18,
      fill: "none",
      stroke: C.lineStrong,
      "stroke-width": 2,
      "stroke-dasharray": "8 8",
    },
    g,
  );
  const [staged, check, canon] = stations;
  if (!staged || !check || !canon) return;
  txt(staged.g, ctx.p.write.isolated, {
    x: 0,
    y: 118,
    "text-anchor": "middle",
    kind: "rowSub",
    fill: C.ink3,
  });
  const eqBase = makeChip(
    ctx,
    g,
    ctx.p.write.baseChip,
    { x: 1062, y: 602 },
    { fill: C.surface, stroke: C.lineStrong, color: C.ink2 },
  );
  const eqCur3 = makeChip(
    ctx,
    g,
    ctx.p.write.currentChip,
    { x: 1226, y: 602 },
    { fill: C.surface, stroke: C.lineStrong, color: C.ink2 },
  );
  const eqCur4 = makeChip(
    ctx,
    g,
    ctx.p.write.currentChipNew,
    { x: 1226, y: 602 },
    { fill: C.accentTint, stroke: C.accent, color: C.green },
  );
  const eqSign = tl.item(
    txt(g, "=", {
      "text-anchor": "middle",
      "dominant-baseline": "central",
      kind: "h1",
      fill: C.ink2,
    }),
    { x: 1140, y: 602, o: 0 },
  );
  const neqSign = tl.item(
    txt(g, "≠", {
      "text-anchor": "middle",
      "dominant-baseline": "central",
      kind: "h1",
      fill: C.amber,
    }),
    { x: 1140, y: 602, o: 0 },
  );
  // The chips have different widths, so centre the whole "base = current" row on the station.
  placeRow([eqBase, eqSign, eqCur3], 1140, 14, "center");
  eqCur4.def.x = eqCur3.def.x;
  eqCur4.set({ x: eqCur3.def.x });
  neqSign.def.x = eqSign.def.x;
  neqSign.set({ x: eqSign.def.x });
  const okBadge = makeCheckBadge(ctx, g, { x: 1140, y: 672 }, true);
  const noBadge = makeCheckBadge(ctx, g, { x: 1140, y: 672 }, false);
  const okPulse = makePulse(ctx, g, { x: 1140, y: 672 }, C.green);
  const noPulse = makePulse(ctx, g, { x: 1140, y: 672 }, C.amber);
  txt(canon.g, ctx.p.write.history, {
    x: 0,
    y: 178,
    "text-anchor": "middle",
    kind: "rowSub",
    fill: C.ink3,
  });
  const slabs = ["v1", "v2", "v3"].map((label, i) => {
    const slab = svg("g", {}, g);
    svg(
      "rect",
      {
        x: -145,
        y: -23,
        width: 290,
        height: 46,
        rx: 10,
        fill: C.surface2,
        stroke: C.line,
        "stroke-width": 2,
      },
      slab,
    );
    txt(slab, label, { x: -124, y: 1, "dominant-baseline": "central", kind: "chip", fill: C.ink3 });
    txt(slab, ctx.p.articleTitle, {
      x: -80,
      y: 1,
      "dominant-baseline": "central",
      kind: "rowSub",
      fill: C.ink3,
    });
    return tl.item(slab, { x: 1550, y: 660 - i * 54, o: 0 });
  });
  const slabTop = svg("g", {}, g);
  svg(
    "rect",
    {
      x: -155,
      y: -33,
      width: 310,
      height: 66,
      rx: 16,
      fill: C.accent,
      opacity: 0.35,
      filter: DEFS.softGlow,
    },
    slabTop,
  );
  svg(
    "rect",
    {
      x: -145,
      y: -23,
      width: 290,
      height: 46,
      rx: 10,
      fill: C.accentTint,
      stroke: C.accent,
      "stroke-width": 2,
    },
    slabTop,
  );
  txt(slabTop, "v4", {
    x: -124,
    y: 1,
    "dominant-baseline": "central",
    kind: "chip",
    fill: C.green,
  });
  txt(slabTop, ctx.p.articleTitle, {
    x: -80,
    y: 1,
    "dominant-baseline": "central",
    kind: "rowSub",
    fill: C.ink,
  });
  const slabTopIt = tl.item(slabTop, { x: 1550, y: 498, o: 0 });
  const tray = svg("g", {}, g);
  const trayIt = tl.item(tray, { x: 1140, y: 830, o: 0 });
  svg(
    "rect",
    {
      x: -170,
      y: -70,
      width: 340,
      height: 140,
      rx: 22,
      fill: "rgba(16,32,29,0.85)",
      stroke: C.amber,
      "stroke-width": 2,
      "stroke-dasharray": "8 8",
      opacity: 0.9,
    },
    tray,
  );
  txt(tray, ctx.p.write.parked, {
    x: 0,
    y: -46,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    kind: "mono",
    fill: C.amber,
  });

  for (const [i, slab] of slabs.entries()) {
    tl.tw(slab, S4 + 1.0 + i * 0.1, 0.45, { o: 1 }, { o: 0 }, ease.out);
  }
  ctx.say(S4 + 0.7, S4 + 5.6, ctx.p.say.everyWrite);

  // First write: the base version is still current, so it is promoted as v4.
  const first = makeProposal(ctx, g, ctx.p.articleTitle, { x: 300, y: 420, s: 0.35 });
  tl.tw(first.it, S4 + 1.3, 0.9, { x: 730, y: slotY, s: 1, o: 1 }, { o: 0 }, ease.out);
  tl.tw(first.it, S4 + 2.8, 0.7, { x: 1140 }, {}, ease.inOut);
  tl.pop(eqBase, S4 + 3.3, 0.4, 0.6);
  tl.pop(eqSign, S4 + 3.5, 0.3, 0.6);
  tl.pop(eqCur3, S4 + 3.6, 0.4, 0.6);
  tl.pop(okBadge, S4 + 4.1, 0.45, 0.4);
  okPulse.fire(S4 + 4.15);
  tl.tw(first.it, S4 + 4.8, 0.7, { x: 1550, y: 498, s: 0.3, o: 0 }, {}, ease.in);
  tl.tw(slabTopIt, S4 + 5.3, 0.6, { o: 1, y: 498 }, { o: 0, y: 454 }, ease.back);
  ctx.say(S4 + 5.8, S4 + 8.2, ctx.p.say.promoted);
  tl.hide(eqSign, S4 + 6.0, 0.3);
  tl.hide(eqCur3, S4 + 6.0, 0.3);
  tl.hide(okBadge, S4 + 6.0, 0.3);
  tl.pop(eqCur4, S4 + 6.3, 0.4, 0.6);

  // Second write: it was staged against v3, but canon moved on. It parks instead of overwriting.
  const second = makeProposal(ctx, g, ctx.p.articleProposed, { x: 300, y: 700, s: 0.35 });
  tl.tw(second.it, S4 + 6.4, 0.9, { x: 730, y: slotY, s: 1, o: 1 }, { o: 0 }, ease.out);
  tl.tw(second.it, S4 + 7.7, 0.7, { x: 1140 }, {}, ease.inOut);
  tl.pop(neqSign, S4 + 8.4, 0.3, 0.6);
  tl.pop(noBadge, S4 + 8.6, 0.45, 0.4);
  noPulse.fire(S4 + 8.65);
  second.conflict(S4 + 8.7, 0.4);
  ctx.say(S4 + 8.5, S5 - 0.3, ctx.p.say.stale);
  tl.tw(trayIt, S4 + 8.9, 0.5, { o: 1 }, { o: 0 }, ease.out);
  tl.tw(second.it, S4 + 9.3, 0.8, { y: 850, s: 0.62 }, {}, ease.inOut);
  tl.hide(gWrite, S5 - 0.45, 0.4);
}

function buildOutro(ctx: SceneCtx, gOutro: Item) {
  const { tl } = ctx;
  const g = gOutro.node;
  const S6 = 39.2;
  tl.tw(gOutro, S6 + 0.1, 0.6, { o: 1 }, { o: 0 }, ease.out);
  ctx.fadeSite(S6 + 0.1);
  const lockup = svg("g", {}, g);
  const lockupIt = tl.item(lockup, { x: 960, y: 430, s: 1, o: 0 });
  const inner = svg("g", { transform: "translate(-425 -92.5) scale(0.3)" }, lockup);
  svg("path", { d: BRAND_LAYERS_PATH, fill: DEFS.tealMark }, inner);
  svg("path", { d: BRAND_LETTER_PATH, fill: C.ink }, inner);
  svg("path", { d: BRAND_WORDMARK_PATH, transform: BRAND_WORDMARK_TRANSFORM, fill: C.ink }, inner);
  tl.tw(lockupIt, S6 + 0.2, 0.9, { o: 1, s: 1 }, { o: 0, s: 0.92 }, ease.out);
  const tagline = tl.item(
    txt(g, ctx.p.outro.tagline, {
      "text-anchor": "middle",
      kind: "tagline",
      fill: C.ink2,
    }),
    { x: 960, y: 606, o: 0 },
  );
  tl.tw(tagline, S6 + 0.9, 0.7, { o: 1, y: 606 }, { o: 0, y: 618 }, ease.out);
  const links = tl.item(
    txt(g, "rementum.dev   ·   github.com/rementum/rementum", {
      "text-anchor": "middle",
      kind: "links",
      fill: C.green,
    }),
    { x: 960, y: 690, o: 0 },
  );
  tl.tw(links, S6 + 1.3, 0.7, { o: 1, y: 690 }, { o: 0, y: 702 }, ease.out);
  const pills = ctx.p.outro.pills.map((label) =>
    makeChip(
      ctx,
      g,
      label,
      { x: 0, y: 776 },
      { fill: C.surface, stroke: C.lineStrong, color: C.ink2, dot: false },
    ),
  );
  placeChips(pills, 960, 20);
  for (const [i, pill] of pills.entries()) tl.pop(pill, S6 + 1.7 + i * 0.1, 0.45, 0.6);
  tl.hide(gOutro, DURATION - 0.6, 0.6);
}

/** Builds every scene into `art`; the caller finalizes the timeline afterwards. */
export function buildScenes(ctx: SceneCtx, art: SVGSVGElement) {
  const gWorld = ctx.tl.item(svg("g", {}, art), { o: 1 });
  const gRead = ctx.tl.item(svg("g", {}, art), { o: 0 });
  const gWrite = ctx.tl.item(svg("g", {}, art), { o: 0 });
  const gOutro = ctx.tl.item(svg("g", {}, art), { o: 0 });
  buildWorld(ctx, gWorld);
  buildRead(ctx, gRead);
  buildWrite(ctx, gWrite);
  buildOutro(ctx, gOutro);
}
