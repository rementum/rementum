export const BRAINS_VIEW_COOKIE = "rementum_brains_view";
export const BRAINS_SORT_COOKIE = "rementum_brains_sort";
export const ARTICLES_SORT_COOKIE = "rementum_articles_sort";

export const BRAINS_VIEWS = ["card", "list"] as const;
export const BRAINS_SORTS = ["updated", "articles", "name"] as const;
export const ARTICLES_SORTS = ["updated", "title"] as const;

export type BrainsView = (typeof BRAINS_VIEWS)[number];
export type BrainsSort = (typeof BRAINS_SORTS)[number];
export type ArticlesSort = (typeof ARTICLES_SORTS)[number];

// Cookie values are untrusted input; anything outside the closed set falls back,
// so a tampered or stale cookie can never reach a fetch path or a sort branch.
export function parsePref<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
