import type { Metadata } from "next";
import { InstanceNav } from "../../components/instance-nav";
import { InstanceOverviewView } from "../../components/instance-overview";
import { PageHeader } from "../../components/ui/page-header";
import { RefreshButton } from "../../components/ui/refresh-button";
import type { InstanceOverview } from "../../lib/admin";
import { api, requireInstanceOwner } from "../../lib/api";

export const metadata: Metadata = { title: "Instance" };

export default async function InstanceOverviewPage() {
  await requireInstanceOwner();
  const overview = await api<InstanceOverview>("/api/v1/admin/overview");

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
      <PageHeader
        kicker="Instance"
        title="Overview"
        description="What this Rementum instance holds and how much it is used, counted across every team."
        actions={<RefreshButton />}
      />
      <div className="mt-6">
        <InstanceNav />
      </div>
      <section className="mt-8">
        <InstanceOverviewView overview={overview} />
      </section>
    </main>
  );
}
