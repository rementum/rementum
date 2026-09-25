import type { Metadata } from "next";
import { InstanceNav } from "../../components/instance-nav";
import { InstanceOverviewView } from "../../components/instance-overview";
import { PageHeader } from "../../components/ui/page-header";
import { RefreshButton } from "../../components/ui/refresh-button";
import type { InstanceOverview } from "../../lib/admin";
import { api, requireInstanceOwner } from "../../lib/api";

import { requestDictionary } from "../../lib/i18n/server";
import { renderTerms } from "../../lib/i18n/terms";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.admin.instance };
}

export default async function InstanceOverviewPage() {
  const { locale, dict } = await requestDictionary();
  const strings = dict.admin;
  await requireInstanceOwner();
  const overview = await api<InstanceOverview>("/api/v1/admin/overview");

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-10 pb-20">
      <PageHeader
        kicker={renderTerms(strings.kicker)}
        title={strings.overview}
        description={strings.overviewDescription}
        actions={
          <RefreshButton label={dict.common.refresh} pendingLabel={dict.common.refreshing} />
        }
      />
      <div className="mt-6">
        <InstanceNav strings={strings} />
      </div>
      <section className="mt-8">
        <InstanceOverviewView overview={overview} locale={locale} strings={strings} />
      </section>
    </main>
  );
}
