import { normalizeArticleSlug, tokenizeWikiLinks } from "@rementum/contracts";
import matter from "gray-matter";
import { Lexer } from "marked";

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

export function parseMarkdownDocument(value: string, fallbackTitle: string) {
  const parsed = matter(value);
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
  const rawAliases = Array.isArray(parsed.data.aliases)
    ? parsed.data.aliases.filter(
        (alias): alias is string => typeof alias === "string" && Boolean(alias.trim()),
      )
    : typeof parsed.data.aliases === "string" && parsed.data.aliases.trim()
      ? [parsed.data.aliases]
      : [];
  return {
    title,
    summary,
    tags,
    aliases: [...new Set(rawAliases.map(normalizeArticleSlug))],
    body: parsed.content.trim(),
    frontmatter: parsed.data,
    wikiLinks: extractWikiLinks(parsed.content),
  };
}

export function slugify(value: string): string {
  return normalizeArticleSlug(value);
}

/** Collects body-derived targets from prose while leaving code examples inert. */
export function extractWikiLinks(markdown: string): string[] {
  const targets = new Set<string>();
  visitMarkdownTokens(Lexer.lex(markdown), targets, new WeakSet());
  return [...targets];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function visitMarkdownTokens(value: unknown, targets: Set<string>, seen: WeakSet<object>): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) visitMarkdownTokens(item, targets, seen);
    return;
  }
  const token = value as Record<string, unknown>;
  if (["code", "codespan", "link", "image"].includes(String(token.type ?? ""))) return;
  if (token.type === "text") {
    const text = typeof token.raw === "string" ? token.raw : token.text;
    if (typeof text === "string") {
      for (const link of tokenizeWikiLinks(text)) targets.add(link.targetSlug);
    }
    return;
  }
  for (const [key, nested] of Object.entries(token)) {
    if (["raw", "text"].includes(key)) continue;
    visitMarkdownTokens(nested, targets, seen);
  }
}
