#!/usr/bin/env node

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const CLEAR = `${ESC}2J${ESC}H`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;

// Rementum Brand Palette
// Deep Graphite: #091514 | Memory Teal: #4AA48F | Mist Teal: #9EC9C1 | Ivory: #F3F5F1 | Slate Line: #2B3A37
const MEMORY_TEAL = `${ESC}38;2;74;164;143m`;
const MIST_TEAL = `${ESC}38;2;158;201;193m`;
const IVORY = `${ESC}38;2;243;245;241m`;
const SLATE_LINE = `${ESC}38;2;43;58;55m`;
const DIM_MIST = `${ESC}38;2;120;160;150m`;
const GREEN_ACCENT = `${ESC}38;2;90;210;150m`;

const PANE_INNER = 52; // inner width per agent pane
const SERVER_INNER = 110; // inner width of server box
const PANE_H = 14;

const leftLines = [];
const rightLines = [];
const serverLines = [];

function stripAnsi(str) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: needed to measure visible length without terminal color codes
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function draw() {
  let out = `${ESC}H`;

  // Header Banner
  out += `\n  ${BOLD}${MEMORY_TEAL}* REMENTUM${RESET} ${SLATE_LINE}|${RESET} ${IVORY}Live Shared Agent Memory Protocol${RESET} ${DIM_MIST}[https://rementum.dev]${RESET}\n\n`;

  // Agent Panes Top Border
  const leftTag = ` ${BOLD}${MEMORY_TEAL}CURSOR${RESET} ${DIM_MIST}(IDE Agent A)${RESET} `;
  const rightTag = ` ${BOLD}${MIST_TEAL}CLAUDE CODE${RESET} ${DIM_MIST}(CLI Agent B)${RESET} `;

  const lDashes = PANE_INNER + 2 - 2 - stripAnsi(leftTag).length;
  const rDashes = PANE_INNER + 2 - 2 - stripAnsi(rightTag).length;

  out += `  ${SLATE_LINE}┌──${RESET}${leftTag}${SLATE_LINE}${"─".repeat(lDashes)}┐${RESET}  ${SLATE_LINE}┌──${RESET}${rightTag}${SLATE_LINE}${"─".repeat(rDashes)}┐${RESET}\n`;

  // Agent Panes Content
  for (let r = 0; r < PANE_H; r++) {
    const lText = leftLines[r] || "";
    const rText = rightLines[r] || "";

    const lPad = " ".repeat(Math.max(0, PANE_INNER - stripAnsi(lText).length));
    const rPad = " ".repeat(Math.max(0, PANE_INNER - stripAnsi(rText).length));

    out += `  ${SLATE_LINE}│${RESET} ${lText}${lPad} ${SLATE_LINE}│${RESET}  ${SLATE_LINE}│${RESET} ${rText}${rPad} ${SLATE_LINE}│${RESET}\n`;
  }

  // Agent Panes Bottom Border
  out += `  ${SLATE_LINE}└${"─".repeat(PANE_INNER + 2)}┘  └${"─".repeat(PANE_INNER + 2)}┘${RESET}\n\n`;

  // Server Engine Box Top Border
  const sTag = ` ${BOLD}${MEMORY_TEAL}REMENTUM SHARED BRAIN${RESET} ${DIM_MIST}(Live Knowledge Sync & Audit)${RESET} `;
  const sDashes = SERVER_INNER + 2 - 2 - stripAnsi(sTag).length;
  out += `  ${SLATE_LINE}┌──${RESET}${sTag}${SLATE_LINE}${"─".repeat(sDashes)}┐${RESET}\n`;

  // Server Box Content
  for (let r = 0; r < 3; r++) {
    const sText = serverLines[r] || "";
    const sPad = " ".repeat(Math.max(0, SERVER_INNER - stripAnsi(sText).length));
    out += `  ${SLATE_LINE}│${RESET} ${sText}${sPad} ${SLATE_LINE}│${RESET}\n`;
  }

  // Server Box Bottom Border
  out += `  ${SLATE_LINE}└${"─".repeat(SERVER_INNER + 2)}┘${RESET}\n`;

  process.stdout.write(out);
}

async function typeLeft(text, delay = 14) {
  leftLines.push("");
  const idx = leftLines.length - 1;
  for (let i = 0; i < text.length; i++) {
    leftLines[idx] = text.slice(0, i + 1);
    draw();
    await sleep(delay);
  }
}

async function typeRight(text, delay = 14) {
  rightLines.push("");
  const idx = rightLines.length - 1;
  for (let i = 0; i < text.length; i++) {
    rightLines[idx] = text.slice(0, i + 1);
    draw();
    await sleep(delay);
  }
}

function addLeft(line) {
  leftLines.push(line);
  draw();
}

function addRight(line) {
  rightLines.push(line);
  draw();
}

function addServer(line) {
  serverLines.push(line);
  draw();
}

async function main() {
  process.stdout.write(CLEAR + HIDE_CURSOR);
  draw();
  await sleep(400);

  // Phase 1: Two agents start up connected to the same shared brain
  addServer(
    `${DIM_MIST}[10:00:01]${RESET} ${IVORY}Workspace connected:${RESET} ${MEMORY_TEAL}2 agents sharing 1 brain${RESET}`,
  );
  await sleep(350);

  // Phase 2: Cursor designs an architectural decision
  await typeLeft(`${DIM_MIST}>${RESET} ${IVORY}"Define worker auth architecture"${RESET}`);
  await sleep(300);
  addLeft(`${DIM_MIST}[spec]${RESET} Formulating specification...`);
  await sleep(400);
  leftLines[1] = `${GREEN_ACCENT}[spec]${RESET} Decision: ${IVORY}HMAC-SHA256 tokens (30s TTL)${RESET}`;
  draw();
  await sleep(350);

  // Cursor stages and promotes to shared brain
  addLeft(``);
  addLeft(
    `${MEMORY_TEAL}[mcp]${RESET}  ${BOLD}stage_write${RESET}(${IVORY}"Worker Auth Spec"${RESET})`,
  );
  await sleep(400);
  addLeft(
    `${GREEN_ACCENT}[ok]${RESET}   Staged ${MIST_TEAL}write_82af${RESET} ${DIM_MIST}(unconflicted)${RESET}`,
  );
  serverLines[0] = `${DIM_MIST}[10:00:03]${RESET} ${IVORY}Staged write_82af:${RESET} ${MIST_TEAL}"Worker Auth Spec"${RESET}`;
  draw();
  await sleep(500);

  addLeft(``);
  addLeft(`${MEMORY_TEAL}[mcp]${RESET}  ${BOLD}promote_staged_write${RESET}(write_82af)`);
  await sleep(400);
  addLeft(`${GREEN_ACCENT}[ok]${RESET}   Promoted! Published to Canon (v1)`);
  serverLines[0] = `${GREEN_ACCENT}[10:00:04] PUBLISHED${RESET} ${IVORY}Cursor added canonical article:${RESET} ${BOLD}${MEMORY_TEAL}"Worker Auth Spec"${RESET}`;
  draw();
  await sleep(800);

  // Phase 3: Claude Code concurrently works on the worker implementation
  await typeRight(`${DIM_MIST}>${RESET} ${IVORY}"Implement worker polling auth"${RESET}`);
  await sleep(300);
  addRight(
    `${MEMORY_TEAL}[mcp]${RESET}  ${BOLD}search_articles${RESET}(${IVORY}"worker auth"${RESET})`,
  );
  await sleep(450);
  rightLines[1] = `${GREEN_ACCENT}[hit]${RESET}  Found: ${IVORY}"Worker Auth Spec"${RESET} ${MIST_TEAL}(v1, just now)${RESET}`;
  draw();
  await sleep(450);

  // Claude Code reads the fresh canonical knowledge published by Cursor
  addRight(``);
  addRight(
    `${MEMORY_TEAL}[mcp]${RESET}  ${BOLD}load_context${RESET}(${IVORY}"Worker Auth Spec"${RESET})`,
  );
  await sleep(400);
  addRight(`      ${DIM_MIST}Spec:${RESET} ${IVORY}HMAC-SHA256 service tokens${RESET}`);
  addRight(`      ${DIM_MIST}TTL:${RESET}  ${IVORY}30s timestamped header${RESET}`);
  serverLines[1] = `${MIST_TEAL}[10:00:06] KNOWLEDGE HIT${RESET} ${IVORY}Claude Code loaded spec published by Cursor${RESET}`;
  draw();
  await sleep(700);

  // Claude Code implements matching client code
  addRight(``);
  addRight(`${GREEN_ACCENT}[sync]${RESET} Generating matching HMAC client`);
  addRight(`${GREEN_ACCENT}[ok]${RESET}   Zero duplicate work · Aligned!`);

  serverLines[2] = `${BOLD}${GREEN_ACCENT}* LIVE SYNC:${RESET} ${IVORY}2 autonomous agents coordinated on${RESET} ${BOLD}${MEMORY_TEAL}https://rementum.dev${RESET}`;
  draw();

  await sleep(10000);
  process.stdout.write(SHOW_CURSOR + "\n");
}

main().catch(console.error);
