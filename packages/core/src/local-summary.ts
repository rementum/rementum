import type { ArticleGenerator } from "./types.js";

export const ROUTING_SUMMARY_MAX_CHARS = 300;
// Only the first sentence survives, so the passes below never need more of the body than
// this. A body may be two million characters, and each pass would otherwise walk all of it.
const SUMMARY_SOURCE_MAX_CHARS = 32_000;

export class LocalArticleGenerator implements ArticleGenerator {
  generateArticle(input: { title: string; body: string }) {
    return Promise.resolve({ ...input, summary: createLocalSummary(input) });
  }
}

export function createLocalSummary(input: { title: string; body: string }): string {
  const content = stripFrontMatter(input.body).slice(0, SUMMARY_SOURCE_MAX_CHARS);
  const withoutDuplicateTitle = removeLeadingTitle(content, input.title);
  const normalized = markdownToPlainText(withoutDuplicateTitle) || input.title.trim();
  const [firstSentence] = new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(
    normalized,
  );
  return clipSentence(firstSentence?.segment.trim() || normalized, ROUTING_SUMMARY_MAX_CHARS);
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
  // A lazy capture followed by trailing whitespace re-scans the line from every
  // character; the greedy form is one pass and trim() drops the same whitespace.
  const heading = /^#{1,6}\s+(.+)$/.exec(lines[firstContent] ?? "");
  if (heading?.[1]?.trim().toLowerCase() !== title.trim().toLowerCase()) return markdown;
  lines.splice(firstContent, 1);
  return lines.join("\n");
}

// Every bracket class below excludes its own opening character. A class that admits it
// lets a run of unclosed openers restart the scan from each one, which turns a body of
// nothing but "<" or "![" into minutes of blocked event loop per request.
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*$/gm, "")
    .replace(/^~~~[^\n]*$/gm, "")
    .replace(/!\[([^[\]]*)\]\(([^()]+)\)/g, "$1")
    .replace(/\[([^[\]]+)\]\(([^()]+)\)/g, "$1 ($2)")
    .replace(/\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_match, target, label) => label ?? target)
    .replace(/<[^<>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:>|[-+*]|\d+[.)])\s+/gm, "")
    .replaceAll("`", "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipSentence(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const slice = value.slice(0, maxChars);
  const boundary = slice.lastIndexOf(" ");
  const clipped = (boundary > Math.floor(maxChars / 2) ? slice.slice(0, boundary) : slice)
    .trimEnd()
    .replace(/[.!?…]+$/u, "");
  return `${clipped.slice(0, maxChars - 1)}…`;
}
