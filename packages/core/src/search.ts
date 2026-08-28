export interface RankedItem<T> {
  item: T;
  score: number;
  source: "routing" | "fts" | "vector" | "rerank";
}

export interface FusedItem<T> {
  item: T;
  score: number;
  sources: string[];
}

export function reciprocalRankFusion<T>(
  lists: Array<ReadonlyArray<RankedItem<T>>>,
  identify: (item: T) => string,
  k = 60,
): FusedItem<T>[] {
  const fused = new Map<string, FusedItem<T>>();
  for (const list of lists) {
    list.forEach((entry, index) => {
      const id = identify(entry.item);
      const current = fused.get(id) ?? { item: entry.item, score: 0, sources: [] };
      current.score += 1 / (k + index + 1);
      if (!current.sources.includes(entry.source)) current.sources.push(entry.source);
      fused.set(id, current);
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score);
}

export function exactTermScore(query: string, value: string): number {
  const terms = tokenize(query);
  if (!terms.length) return 0;
  const haystack = new Set(tokenize(value));
  return terms.filter((term) => haystack.has(term)).length / terms.length;
}

// Prefix matching lets an agent find a brain from a partial project name ("remen" → "rementum")
// without a database round trip; brain metadata is small enough to rank in memory.
export function prefixTermScore(query: string, value: string): number {
  const terms = tokenize(query);
  if (!terms.length) return 0;
  const haystack = tokenize(value);
  const matched = terms.filter((term) =>
    haystack.some((token) => token === term || token.startsWith(term)),
  );
  return matched.length / terms.length;
}

export interface BrainSearchFields {
  slug: string;
  name: string;
  description: string;
}

export function rankBrains<T extends BrainSearchFields>(
  brains: ReadonlyArray<T>,
  query: string,
  limit: number,
): T[] {
  return brains
    .map((brain) => ({
      brain,
      score:
        3 * prefixTermScore(query, `${brain.slug} ${brain.name}`) +
        prefixTermScore(query, brain.description),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.brain.name.localeCompare(b.brain.name))
    .slice(0, limit)
    .map((entry) => entry.brain);
}

export function tokenize(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1);
}
