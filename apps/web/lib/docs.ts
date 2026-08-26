import { promises as fs } from "node:fs";
import path from "node:path";

/** One entry per page in repo-root docs/ — the same files MkDocs publishes. */
export interface DocPage {
  slug: string;
  file: string;
  title: string;
  group: string;
}

export const DOC_PAGES: DocPage[] = [
  { slug: "", file: "index.md", title: "Overview", group: "Get started" },
  { slug: "installation", file: "installation.md", title: "Install", group: "Get started" },
  { slug: "configuration", file: "configuration.md", title: "Configure", group: "Get started" },
  { slug: "operations", file: "operations.md", title: "Backups and upgrades", group: "Operate" },
  { slug: "security", file: "security.md", title: "Security checklist", group: "Operate" },
  { slug: "integrations", file: "integrations.md", title: "Connect agents", group: "Reference" },
  { slug: "development", file: "development.md", title: "Development", group: "Reference" },
  { slug: "brand", file: "brand.md", title: "Brand", group: "Reference" },
];

export function docHref(page: DocPage): string {
  return page.slug ? `/docs/${page.slug}` : "/docs";
}

const HREF_BY_FILE = new Map(DOC_PAGES.map((page) => [page.file, docHref(page)]));

/**
 * Adapt MkDocs-flavored markdown for the in-app renderer: drop banner images whose
 * assets ship only with the MkDocs site, point .md links at /docs routes, and strip
 * attr_list annotations ({ .md-button }) that react-markdown would print literally.
 */
export function transformDocMarkdown(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !/^!\[[^\]]*\]\(assets\//.test(line))
    .join("\n")
    .replace(/\]\(([\w-]+\.md)(#[\w-]+)?\)/g, (match, file, anchor) => {
      const href = HREF_BY_FILE.get(file);
      return href ? `](${href}${anchor ?? ""})` : match;
    })
    .replace(/\{:?\s*\.[^}]*\}/g, "");
}

// The repo-root docs directory: cwd is apps/web under `next dev`/CI, but the
// standalone server runs from the traced monorepo root.
const DOCS_DIR_CANDIDATES = [
  path.join(process.cwd(), "..", "..", "docs"),
  path.join(process.cwd(), "docs"),
];

async function docsDir(): Promise<string> {
  for (const candidate of DOCS_DIR_CANDIDATES) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("The docs directory is missing from this deployment.");
}

export async function loadDoc(slug: string): Promise<{ page: DocPage; body: string } | null> {
  const page = DOC_PAGES.find((entry) => entry.slug === slug);
  if (!page) return null;
  const raw = await fs.readFile(path.join(await docsDir(), page.file), "utf8");
  return { page, body: transformDocMarkdown(raw) };
}
