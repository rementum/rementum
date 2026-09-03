import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GITHUB_URL, SITE_URL } from "./site";

const DOCS_BASE_URL = `${SITE_URL}/docs`;

const SUMMARY =
  "Rementum is a self-hosted, open-source memory layer for AI agents. Agents read and write " +
  "versioned Markdown articles over MCP, coordinate through tasks, and connect with OAuth. You run " +
  "it on your own server and hold the database, encryption key, optional AI provider, and backups.";

// Ordered to match the MkDocs nav. `path` is the page URL under /docs; `blurb` is the one-line
// index entry (kept here so every entry reads well, since some pages open straight into a heading).
export const PAGES = [
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
    title: "Connect agents",
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
] as const;

// Turbopack traces filesystem reads into the standalone output. The ignore comments stop it from
// tracing the whole project; the docs it still traces are bounded by the Dockerfile copying only
// the Markdown pages.
function findDocsDir(): string {
  // `next build` and `next dev` run from apps/web; vitest runs from the repository root. Nearest
  // first, so a stray docs/ above the checkout can never shadow the repository's own.
  const candidates = [resolve(process.cwd(), "docs"), resolve(process.cwd(), "../../docs")];
  for (const candidate of candidates) {
    if (
      existsSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ candidate, "index.md"))
    ) {
      return candidate;
    }
  }
  throw new Error(`Could not find docs directory. Checked: ${candidates.join(", ")}`);
}

// Drop MkDocs-only syntax so the text reads as plain Markdown for a model.
export function cleanMarkdown(markdown: string): string {
  const out: string[] = [];
  let dedenting = false;
  let inFence = false;
  for (const raw of markdown.split("\n")) {
    let line = raw;
    // Code samples pass through verbatim: the rewrites below would corrupt `{ ...x }` and friends.
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // Banner and logo images reference local assets that a model cannot fetch.
    if (/^!\[[^\]]*\]\(assets\//.test(line.trim())) continue;
    // Admonitions: `!!! warning "Title"` becomes a bold title and its indented body is flattened.
    // An untitled one keeps its type as the title, which is what MkDocs renders.
    const adm = line.match(/^!!!\s+(\w+)(?:\s+"([^"]*)")?\s*$/);
    if (adm) {
      const type = adm[1] ?? "note";
      out.push(`**${adm[2] ?? `${type.charAt(0).toUpperCase()}${type.slice(1)}`}**`);
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
    // Attribute lists like `{ .md-button }` and `{ .rementum-banner }` only ever end a line.
    line = line.replace(/\s*\{\s*[.:#][^}]*\}\s*$/, "");
    out.push(line);
  }
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function pageUrl(page: { path: string }): string {
  return `${DOCS_BASE_URL}${page.path}`;
}

function loadPages() {
  const docsDir = findDocsDir();
  return PAGES.map((page) => {
    const body = readFileSync(
      /*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ docsDir, page.file),
      "utf8",
    );
    return { ...page, cleaned: cleanMarkdown(body), url: pageUrl(page) };
  });
}

// The index is built from the page table alone, so it never touches the filesystem.
export function getLlmsTxt(): string {
  return `${[
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
    ...PAGES.map((p) => `- [${p.title}](${pageUrl(p)}): ${p.blurb}`),
    "",
    "## Source",
    "",
    `- [GitHub repository](${GITHUB_URL}): source, issues, and releases (AGPL-3.0)`,
    `- [Full text for LLMs](${SITE_URL}/llms-full.txt): every documentation page inlined as one file`,
  ].join("\n")}\n`;
}

export function getLlmsFullTxt(): string {
  const pages = loadPages();
  return `${[
    "# Rementum documentation",
    "",
    `> ${SUMMARY}`,
    "",
    `Source: ${SITE_URL} · Repository: ${GITHUB_URL} · License: AGPL-3.0`,
    "",
    "This file inlines every documentation page for language models. Each section names its source URL.",
    ...pages.flatMap((p) => ["", "---", "", `Source: ${p.url}`, "", p.cleaned.trimEnd()]),
  ].join("\n")}\n`;
}
