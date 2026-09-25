import type { Metadata } from "next";
import { Dashboard } from "../../components/dashboard";
import { requestDictionary } from "../../lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.dashboard.title };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sharedPage?: string }>;
}) {
  const { page, sharedPage } = await searchParams;
  const { locale, dict } = await requestDictionary();
  return <Dashboard page={page} sharedPage={sharedPage} locale={locale} dict={dict} />;
}
