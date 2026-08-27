import { ButtonLink } from "./button-link";

/** Prev/Next pagination over URL search params. Renders nothing for a single page. */
export function Pager({
  page,
  pageCount,
  makeHref,
  className = "",
}: {
  page: number;
  pageCount: number;
  makeHref: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className={`flex items-center justify-between gap-4 ${className}`}>
      {page > 1 ? (
        <ButtonLink href={makeHref(page - 1)} variant="ghost" size="sm">
          ← Previous
        </ButtonLink>
      ) : (
        <span aria-disabled="true" className="px-3 py-1.5 text-sm text-ink-3/60">
          ← Previous
        </span>
      )}
      <span className="font-mono text-2xs tabular-nums text-ink-3">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <ButtonLink href={makeHref(page + 1)} variant="ghost" size="sm">
          Next →
        </ButtonLink>
      ) : (
        <span aria-disabled="true" className="px-3 py-1.5 text-sm text-ink-3/60">
          Next →
        </span>
      )}
    </nav>
  );
}
