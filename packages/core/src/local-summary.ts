import type { SummaryGenerator } from "./types.js";

const MAX_SUMMARY_CHARS = 1_000;
const HEAD_CHARS = 700;
const SEPARATOR = " … ";

export class LocalSummaryGenerator implements SummaryGenerator {
  generateSummary(input: { title: string; body: string }): Promise<string> {
    return Promise.resolve(createLocalSummary(input));
  }
}

export function createLocalSummary(input: { title: string; body: string }): string {
  const content = stripFrontMatter(input.body);
  const withoutDuplicateTitle = removeLeadingTitle(content, input.title);
  const normalized = markdownToPlainText(withoutDuplicateTitle) || input.title.trim();
  if (normalized.length <= MAX_SUMMARY_CHARS) return normalized;

  const head = clipEnd(normalized, HEAD_CHARS);
  const tailBudget = MAX_SUMMARY_CHARS - head.length - SEPARATOR.length;
  const tail = clipStart(normalized, tailBudget);
  return `${head}${SEPARATOR}${tail}`;
}

function stripFrontMatter(markdown: string): string {
  const normalized = markdown.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return normalized;
  const end = normalized.indexOf("\n---\n", 4);
  return end === -1 ? normalized : normalized.slice(end + 5);
}

function removeLeadingTitle(markdown: string, title: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const firstContent = lines.findIndex((line) => line.trim());
  if (firstContent === -1) return markdown;
  const heading = /^#{1,6}\s+(.+?)\s*$/.exec(lines[firstContent] ?? "");
  if (heading?.[1]?.trim().toLowerCase() !== title.trim().toLowerCase()) return markdown;
  lines.splice(firstContent, 1);
  return lines.join("\n");
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*$/gm, "")
    .replace(/^~~~[^\n]*$/gm, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => label ?? target)
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:>|[-+*]|\d+[.)])\s+/gm, "")
    .replaceAll("`", "")
    .replace(/\s+/g, " ")
    .trim();
}

function clipEnd(value: string, maxChars: number): string {
  const slice = value.slice(0, maxChars + 1);
  const boundary = slice.lastIndexOf(" ");
  return value.length > maxChars && boundary > Math.floor(maxChars / 2)
    ? slice.slice(0, boundary).trimEnd()
    : value.slice(0, maxChars).trimEnd();
}

function clipStart(value: string, maxChars: number): string {
  const slice = value.slice(-maxChars - 1);
  const boundary = slice.indexOf(" ");
  return value.length > maxChars && boundary >= 0
    ? slice.slice(boundary + 1).trimStart()
    : value.slice(-maxChars).trimStart();
}
