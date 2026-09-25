import type { Metadata } from "next";
import { EmptyState } from "../../components/ui/empty-state";
import { PageHeader } from "../../components/ui/page-header";
import { RefreshButton } from "../../components/ui/refresh-button";
import { UsageAnalyticsView } from "../../components/usage-analytics";
import { parseAnalyticsDay, parseAnalyticsRange, type UsageAnalytics } from "../../lib/analytics";
import { api, workspaceContext } from "../../lib/api";
import { requestDictionary } from "../../lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.analytics.title };
}

export default async function WorkspaceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; day?: string | string[] }>;
}) {
  const { locale, dict } = await requestDictionary();
  const query = await searchParams;
  const range = parseAnalyticsRange(query.range);
  const day = parseAnalyticsDay(query.day);
  const { activeTeam, activeWorkspace } = await workspaceContext();
  if (!activeTeam || !activeWorkspace) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
        <PageHeader kicker={dict.analytics.noWorkspaceKicker} title={dict.analytics.title} />
        <section className="mt-8">
          <EmptyState
            title={dict.analytics.noWorkspaceTitle}
            body={dict.analytics.noWorkspaceBody}
          />
        </section>
      </main>
    );
  }

  const analytics = await api<UsageAnalytics>(
    `/api/v1/workspaces/${activeWorkspace.id}/analytics?range=${range}${day ? `&day=${day}` : ""}`,
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
      <PageHeader
        kicker={`${activeTeam.name} · ${activeWorkspace.name}`}
        title={dict.analytics.title}
        description={dict.analytics.description}
        actions={
          <RefreshButton
            href={`/activity?range=${range}`}
            label={dict.analytics.refresh}
            pendingLabel={dict.analytics.refreshing}
          />
        }
      />
      <section className="mt-8">
        <UsageAnalyticsView
          locale={locale}
          dict={dict}
          analytics={analytics}
          day={day}
          range={range}
          rangePath="/activity"
        />
      </section>
    </main>
  );
}
