import type { Metadata } from "next";
import { EmptyState } from "../../components/ui/empty-state";
import { PageHeader } from "../../components/ui/page-header";
import { RefreshButton } from "../../components/ui/refresh-button";
import { UsageAnalyticsView } from "../../components/usage-analytics";
import { parseAnalyticsRange, type UsageAnalytics } from "../../lib/analytics";
import { api, workspaceContext } from "../../lib/api";

export const metadata: Metadata = { title: "Analytics" };

export default async function WorkspaceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const range = parseAnalyticsRange((await searchParams).range);
  const { activeTeam, activeWorkspace } = await workspaceContext();
  if (!activeTeam || !activeWorkspace) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
        <PageHeader kicker="Workspace" title="Analytics" />
        <section className="mt-8">
          <EmptyState
            title="No workspace yet."
            body="Create a team and workspace to begin tracking MCP usage."
          />
        </section>
      </main>
    );
  }

  const analytics = await api<UsageAnalytics>(
    `/api/v1/workspaces/${activeWorkspace.id}/analytics?range=${range}`,
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
      <PageHeader
        kicker={`${activeTeam.name} · ${activeWorkspace.name}`}
        title="Analytics"
        description="See where connected agents spend attention across this workspace."
        actions={<RefreshButton />}
      />
      <section className="mt-8">
        <UsageAnalyticsView analytics={analytics} range={range} rangePath="/activity" />
      </section>
    </main>
  );
}
