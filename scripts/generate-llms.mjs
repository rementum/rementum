#!/usr/bin/env node
// Builds /llms.txt and /llms-full.txt from the MkDocs pages in docs/ (see https://llmstxt.org).
// The web app has no access to docs/ at build time, so the content is baked into a committed TS
// module that the route handlers import. Rerun with `pnpm llms:generate` after editing docs/.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://rementum.dev";
const DOCS = `${SITE}/docs`;

const SUMMARY =
  "Rementum is a self-hosted, open-source memory layer for AI agents. Agents read and write " +
  "versioned Markdown articles over MCP, coordinate through tasks, and connect with OAuth. You run " +
  "it on your own server and hold the database, encryption key, optional AI provider, and backups.";

// Ordered to match the MkDocs nav. `path` is the page URL under /docs; `blurb` is the one-line
// index entry (kept here so every entry reads well, since some pages open straight into a heading).
const PAGES = [
  {
    file: "index.md",
    title: "Overview",
    path: "/",
    blurb:
      "What Rementum is, how teams, workspaces, and brains fit together, the services, and what is encrypted.",
  },
  {
    file: "installation.md",
    title: "Install",
    path: "/installation/",
    blurb:
      "Requirements, the install script, installing without prompts, verifying the instance, saving the master key, and public registration.",
  },
  {
    file: "configuration.md",
    title: "Configure",
    path: "/configuration/",
    blurb:
      "Every .env setting: public endpoint and auth, bot protection, article generation and compaction, email, and storage and search.",
  },
  {
    file: "operations.md",
    title: "Backups and upgrades",
    path: "/operations/",
    blurb:
      "Health probes, encrypted age backups, the update and redeploy flow, deployment memory limits, and restore.",
  },
  {
    file: "security.md",
    title: "Security",
    path: "/security/",
    blurb:
      "The checklist to run before storing private knowledge: network, secrets, article generation mode, accounts and deletion, and backups.",
  },
  {
    file: "integrations.md",
    title: "Connect an agent",
    path: "/integrations/",
    blurb:
      "Copy a workspace MCP URL and connect Claude Code, Codex, Cursor, OpenCode, Claude, ChatGPT, or any MCP client, plus the tools an agent calls first.",
  },
  {
    file: "brand.md",
    title: "Brand",
    path: "/brand/",
    blurb: "The Rementum brand: logo, color tokens, typography, and voice.",
  },
  {
    file: "development.md",
    title: "Development",
    path: "/development/",
    blurb:
      "Run the stack in containers or on the host, the check commands, integration-test setup, and building the docs.",
  },
];

// Drop MkDocs-only syntax so the text reads as plain Markdown for a model.
function clean(markdown) {
  const out = [];
  let dedenting = false;
  for (const raw of markdown.split("\n")) {
    let line = raw;
    // Banner and logo images reference local assets that a model cannot fetch.
    if (/^!\[[^\]]*\]\(assets\//.test(line.trim())) continue;
    // Admonitions: turn `!!! warning "Title"` into a bold note and flatten its indented body.
    const adm = line.match(/^!!!\s+\w+(?:\s+"([^"]*)")?\s*$/);
    if (adm) {
      out.push(`**${adm[1] ?? "Note"}**`);
      dedenting = true;
      continue;
    }
    if (dedenting) {
      if (line.trim() === "") {
        out.push("");
        continue;
      }
      if (line.startsWith("    ")) {
        line = line.slice(4);
      } else {
        dedenting = false;
      }
    }
    // Attribute lists like `{ .md-button }` and `{ .rementum-banner }`.
    line = line.replace(/\s*\{[.:#][^}]*\}/g, "");
    out.push(line);
  }
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

const pages = PAGES.map((page) => {
  const cleaned = clean(readFileSync(join(root, "docs", page.file), "utf8"));
  return { ...page, cleaned, url: `${DOCS}${page.path}` };
});

const llmsTxt = `${[
  "# Rementum",
  "",
  `> ${SUMMARY}`,
  "",
  "Rementum is a pnpm/TypeScript monorepo: a Fastify API (REST, OAuth, MCP), a Next.js web app, a",
  "background worker, and a local embedding service, over PostgreSQL with pgvector. The pages below",
  "are the operator and integration documentation.",
  "",
  "## Documentation",
  "",
  ...pages.map((p) => `- [${p.title}](${p.url}): ${p.blurb}`),
  "",
  "## Source",
  "",
  `- [GitHub repository](${"https://github.com/rementum/rementum"}): source, issues, and releases (AGPL-3.0)`,
  `- [Full text for LLMs](${SITE}/llms-full.txt): every documentation page inlined as one file`,
].join("\n")}\n`;

const llmsFull = `${[
  "# Rementum documentation",
  "",
  `> ${SUMMARY}`,
  "",
  `Source: ${SITE} · Repository: https://github.com/rementum/rementum · License: AGPL-3.0`,
  "",
  "This file inlines every documentation page for language models. Each section names its source URL.",
  ...pages.flatMap((p) => ["", "---", "", `Source: ${p.url}`, "", p.cleaned.trimEnd()]),
].join("\n")}\n`;

// Biome wraps a long `const x = "..."` onto the next line; match that so the emitted file is
// already formatted and a regeneration never shows up as a Biome diff.
const module = `${[
  "// GENERATED by scripts/generate-llms.mjs. Do not edit by hand.",
  "// Run `pnpm llms:generate` after editing docs/ to refresh this file, and commit the result.",
  "// The route handlers at app/llms.txt and app/llms-full.txt serve these strings verbatim.",
  "export const LLMS_TXT =",
  `  ${JSON.stringify(llmsTxt)};`,
  "",
  "export const LLMS_FULL_TXT =",
  `  ${JSON.stringify(llmsFull)};`,
].join("\n")}\n`;

const target = join(root, "apps/web/lib/llms-content.ts");
writeFileSync(target, module);
console.log(
  `Wrote ${target}\n  llms.txt: ${llmsTxt.length} bytes\n  llms-full.txt: ${llmsFull.length} bytes`,
);
