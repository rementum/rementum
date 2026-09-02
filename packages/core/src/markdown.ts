import { load as parseYaml } from "js-yaml";
import { DomainError } from "./errors.js";

export interface MarkdownSection {
  ordinal: number;
  heading: string | null;
  level: number | null;
  text: string;
}

const HEADING = /^(#{1,6})\s+(.+)$/;

export function splitMarkdownByHeading(markdown: string, maxChars = 4_000): MarkdownSection[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const raw: Omit<MarkdownSection, "ordinal">[] = [];
  let current: Omit<MarkdownSection, "ordinal"> = {
    heading: null,
    level: null,
    text: "",
  };

  const flush = () => {
    if (current.text.trim()) raw.push({ ...current, text: current.text.trim() });
  };

  for (const line of lines) {
    const match = HEADING.exec(line);
    if (match) {
      flush();
      current = {
        heading: match[2]?.trim() ?? null,
        level: match[1]?.length ?? null,
        text: `${line}\n`,
      };
    } else {
      current.text += `${line}\n`;
    }
  }
  flush();

  const chunks: Omit<MarkdownSection, "ordinal">[] = [];
  for (const section of raw) {
    if (section.text.length <= maxChars) {
      chunks.push(section);
      continue;
    }
    const paragraphs = section.text.split(/\n{2,}/);
    let buffer = "";
    for (const paragraph of paragraphs) {
      if (buffer && buffer.length + paragraph.length + 2 > maxChars) {
        chunks.push({ ...section, text: buffer.trim() });
        buffer = "";
      }
      if (paragraph.length > maxChars) {
        for (let offset = 0; offset < paragraph.length; offset += maxChars) {
          const part = paragraph.slice(offset, offset + maxChars);
          if (buffer) {
            chunks.push({ ...section, text: buffer.trim() });
            buffer = "";
          }
          chunks.push({ ...section, text: part.trim() });
        }
      } else {
        buffer += `${buffer ? "\n\n" : ""}${paragraph}`;
      }
    }
    if (buffer.trim()) chunks.push({ ...section, text: buffer.trim() });
  }

  return chunks.map((section, ordinal) => ({ ...section, ordinal }));
}

/**
 * Splits a document into its YAML front matter and body.
 *
 * The block is recognised only when the document opens with a line that is exactly `---`
 * and closes with another. The general-purpose front matter parsers also accept `---js`
 * and hand the block to a JavaScript engine, which is remote code execution for anyone
 * who can upload an archive; nothing here ever lets the document choose a parser.
 */
export function splitFrontMatter(value: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const text = value.startsWith("\uFEFF") ? value.slice(1) : value;
  const open = text.startsWith("---\n") ? 4 : text.startsWith("---\r\n") ? 5 : -1;
  if (open === -1) return { data: {}, content: text };
  let cursor = open;
  while (cursor <= text.length) {
    const lineEnd = text.indexOf("\n", cursor);
    const line = text.slice(cursor, lineEnd === -1 ? text.length : lineEnd).replace(/\r$/, "");
    if (line === "---") {
      const raw = text.slice(open, cursor);
      const content = lineEnd === -1 ? "" : text.slice(lineEnd + 1);
      return { data: parseFrontMatter(raw), content };
    }
    if (lineEnd === -1) break;
    cursor = lineEnd + 1;
  }
  return { data: {}, content: text };
}

function parseFrontMatter(raw: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch {
    throw new DomainError("invalid_frontmatter", "Front matter is not valid YAML", 400);
  }
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export function parseMarkdownDocument(value: string, fallbackTitle: string) {
  const parsed = splitFrontMatter(value);
  const firstHeading = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = stringValue(parsed.data.title) ?? firstHeading ?? fallbackTitle;
  const summary =
    stringValue(parsed.data.summary) ??
    parsed.content
      .replace(/^#{1,6}\s+.+$/gm, "")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .find(Boolean)
      ?.slice(0, 500) ??
    title;
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.filter((tag): tag is string => typeof tag === "string")
    : typeof parsed.data.tags === "string"
      ? parsed.data.tags.split(/[ ,]+/).filter(Boolean)
      : [];
  return {
    title,
    summary,
    tags,
    aliases: Array.isArray(parsed.data.aliases)
      ? parsed.data.aliases.filter((alias): alias is string => typeof alias === "string")
      : [],
    body: parsed.content.trim(),
    frontmatter: parsed.data,
    // Neither class may match "[": with it allowed, a run of opening brackets makes the
    // scan restart from every one of them, which is quadratic on a 10 MB file.
    wikiLinks: [...parsed.content.matchAll(/\[\[([^[\]|#]+)(?:\|[^[\]]+)?\]\]/g)].map((match) =>
      (match[1] ?? "").trim(),
    ),
  };
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "untitled";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
