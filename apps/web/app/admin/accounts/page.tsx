import type { Metadata } from "next";
import { InstanceAccounts } from "../../../components/instance-accounts";
import { InstanceNav } from "../../../components/instance-nav";
import { PageHeader } from "../../../components/ui/page-header";
import { RefreshButton } from "../../../components/ui/refresh-button";
import {
  ACCOUNTS_PAGE_SIZE,
  type InstanceUsersPage,
  parsePage,
  parseQuery,
} from "../../../lib/admin";
import { api, requireInstanceOwner } from "../../../lib/api";

export const metadata: Metadata = { title: "Accounts" };

export default async function InstanceAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  await requireInstanceOwner();
  const params = await searchParams;
  const query = parseQuery(params.q);
  const fetchAt = (target: number) => {
    const search = new URLSearchParams({
      query,
      limit: String(ACCOUNTS_PAGE_SIZE),
      offset: String((target - 1) * ACCOUNTS_PAGE_SIZE),
    });
    return api<InstanceUsersPage>(`/api/v1/admin/accounts?${search}`);
  };
  let pageNumber = parsePage(params.page);
  let page = await fetchAt(pageNumber);
  const lastPage = Math.max(1, Math.ceil(page.total / ACCOUNTS_PAGE_SIZE));
  // A stale URL can point past the end; land on the last page instead of an empty table.
  if (!page.items.length && page.total > 0 && pageNumber > lastPage) {
    pageNumber = lastPage;
    page = await fetchAt(pageNumber);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
      <PageHeader
        kicker="Instance"
        title="Accounts"
        description="Every registered account on this instance, newest first."
        actions={<RefreshButton />}
      />
      <div className="mt-6">
        <InstanceNav />
      </div>
      <section className="mt-8">
        <InstanceAccounts page={page} pageNumber={pageNumber} />
      </section>
    </main>
  );
}
