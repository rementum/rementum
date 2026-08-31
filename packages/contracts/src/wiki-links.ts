export interface WikiLinkToken {
  raw: string;
  target: string;
  targetSlug: string;
  heading: string | null;
  label: string | null;
  start: number;
  end: number;
}

/** The same deterministic ASCII slug form used by articles and wiki-link targets. */
export function normalizeArticleSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "untitled";
}

/**
 * Tokenises wiki links inside an already-parsed Markdown text node.
 *
 * Markdown structure is deliberately the caller's responsibility: core feeds this only
 * prose tokens and the web renderer feeds it only mdast text nodes, so code stays inert.
 */
export function tokenizeWikiLinks(value: string): WikiLinkToken[] {
  const tokens: WikiLinkToken[] = [];
  const pattern = /\[\[([^\]\n]+)\]\]/g;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (isEscaped(value, start)) continue;
    const inner = match[1] ?? "";
    const separator = inner.indexOf("|");
    const destination = (separator === -1 ? inner : inner.slice(0, separator)).trim();
    const label = separator === -1 ? null : inner.slice(separator + 1).trim() || null;
    const headingSeparator = destination.indexOf("#");
    const target = (
      headingSeparator === -1 ? destination : destination.slice(0, headingSeparator)
    ).trim();
    const heading =
      headingSeparator === -1 ? null : destination.slice(headingSeparator + 1).trim() || null;
    if (!target) continue;
    const raw = match[0];
    tokens.push({
      raw,
      target,
      targetSlug: normalizeArticleSlug(target),
      heading,
      label,
      start,
      end: start + raw.length,
    });
  }
  return tokens;
}

function isEscaped(value: string, start: number): boolean {
  let slashes = 0;
  for (let index = start - 1; index >= 0 && value[index] === "\\"; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}
