import Link from "next/link";
import {
  ACCOUNTS_PAGE_SIZE,
  accountStatus,
  accountsHref,
  type InstanceUsersPage,
} from "../lib/admin";
import { formatDate, formatDateTime, relativeTime } from "../lib/format";
import { type Dictionary, template } from "../lib/i18n/get-dictionary";
import { INTL_LOCALE, type Locale } from "../lib/i18n/locales";
import { renderTerms } from "../lib/i18n/terms";
import { Card, CardHeader } from "./ui/card";
import { Chip } from "./ui/chip";
import { fieldControlClass } from "./ui/field";
import { Pager } from "./ui/pager";
import { StatusPill } from "./ui/status-pill";

const headingClass = "px-4 py-2 text-left font-medium";

export function InstanceAccounts({
  page,
  pageNumber,
  dict,
  locale,
}: {
  page: InstanceUsersPage;
  pageNumber: number;
  dict: Dictionary;
  locale: Locale;
}) {
  const strings = dict.admin;
  const statuses = {
    active: strings.statusActive,
    unverified: strings.statusUnverified,
    disabled: strings.statusDisabled,
  };
  const pageCount = Math.max(1, Math.ceil(page.total / ACCOUNTS_PAGE_SIZE));
  return (
    <div className="space-y-5">
      <form action="/admin/accounts" className="flex flex-wrap items-center gap-2" method="get">
        <label className="sr-only" htmlFor="accounts-query">
          {renderTerms(strings.searchAccounts)}
        </label>
        <input
          className={`${fieldControlClass} max-w-sm`}
          defaultValue={page.query}
          id="accounts-query"
          maxLength={200}
          name="q"
          placeholder={strings.searchPlaceholder}
          type="search"
        />
        <button
          className="inline-flex items-center rounded-control border border-line bg-surface px-3 py-2 font-medium text-ink-2 text-xs shadow-btn transition-all hover:bg-hover hover:text-ink active:scale-[0.96]"
          type="submit"
        >
          {renderTerms(strings.search)}
        </button>
        {page.query ? (
          <Link
            className="text-ink-3 text-xs transition-colors hover:text-ink hover:underline"
            href="/admin/accounts"
          >
            {renderTerms(strings.clear)}
          </Link>
        ) : null}
      </form>

      <Card>
        <CardHeader
          title={strings.accounts}
          count={page.total.toLocaleString(INTL_LOCALE[locale])}
          {...(page.query
            ? { action: <Chip>{template(strings.matchingQuery, { query: page.query })}</Chip> }
            : {})}
        />
        {page.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="font-mono text-[10px] text-ink-3 uppercase tracking-[0.08em]">
                  <th className={headingClass} scope="col">
                    {renderTerms(strings.account)}
                  </th>
                  <th className={headingClass} scope="col">
                    {renderTerms(strings.status)}
                  </th>
                  <th className={`${headingClass} text-right`} scope="col">
                    {renderTerms(strings.teams)}
                  </th>
                  <th className={`${headingClass} text-right`} scope="col">
                    {renderTerms(strings.agents)}
                  </th>
                  <th className={headingClass} scope="col">
                    {renderTerms(strings.joined)}
                  </th>
                  <th className={headingClass} scope="col">
                    {renderTerms(strings.lastActive)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {page.items.map((user) => (
                  <tr className="transition-colors hover:bg-hover/60" key={user.id}>
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-medium text-ink">
                        {user.displayName || user.email}
                      </p>
                      <p className="truncate font-mono text-2xs text-ink-3">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusPill
                          status={accountStatus(user)}
                          label={statuses[accountStatus(user)]}
                        />
                        {user.systemOwner ? (
                          <Chip tone="accent">{renderTerms(strings.instanceOwner)}</Chip>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink tabular-nums">
                      {user.teams.toLocaleString(INTL_LOCALE[locale])}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink tabular-nums">
                      {user.mcpConnections.toLocaleString(INTL_LOCALE[locale])}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      <time
                        dateTime={user.createdAt}
                        title={formatDateTime(user.createdAt, locale)}
                      >
                        {formatDate(user.createdAt, locale)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {user.lastActiveAt ? (
                        <time
                          dateTime={user.lastActiveAt}
                          title={formatDateTime(user.lastActiveAt, locale)}
                        >
                          {relativeTime(user.lastActiveAt, locale)}
                        </time>
                      ) : (
                        <span className="text-ink-3">{renderTerms(strings.noActivity)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-ink-3 text-sm">
            {page.query ? strings.noMatches : strings.noAccounts}
          </p>
        )}
      </Card>

      <Pager
        dict={dict}
        page={pageNumber}
        pageCount={pageCount}
        makeHref={(target) => accountsHref(page.query, target)}
      />
    </div>
  );
}
