import { type Dictionary, getDictionary, template } from "../../lib/i18n/get-dictionary";
import { ButtonLink } from "./button-link";

/** Prev/Next pagination over URL search params. Renders nothing for a single page. */
export function Pager({
  page,
  pageCount,
  makeHref,
  className = "",
  // Optional so out-of-scope callers (brains list, admin) stay English untouched.
  dict,
}: {
  page: number;
  pageCount: number;
  makeHref: (page: number) => string;
  className?: string;
  dict?: Dictionary;
}) {
  if (pageCount <= 1) return null;
  const strings = dict ?? getDictionary("en");
  const prev = `← ${strings.common.previous}`;
  const next = `${strings.common.next} →`;
  return (
    <nav
      aria-label={strings.common.pagination}
      className={`flex items-center justify-between gap-4 ${className}`}
    >
      {page > 1 ? (
        <ButtonLink href={makeHref(page - 1)} variant="ghost" size="sm">
          {prev}
        </ButtonLink>
      ) : (
        <span aria-disabled="true" className="px-3 py-1.5 text-sm text-ink-3/60">
          {prev}
        </span>
      )}
      <span className="font-mono text-2xs tabular-nums text-ink-3">
        {template(strings.common.pageOf, { page, pageCount })}
      </span>
      {page < pageCount ? (
        <ButtonLink href={makeHref(page + 1)} variant="ghost" size="sm">
          {next}
        </ButtonLink>
      ) : (
        <span aria-disabled="true" className="px-3 py-1.5 text-sm text-ink-3/60">
          {next}
        </span>
      )}
    </nav>
  );
}
