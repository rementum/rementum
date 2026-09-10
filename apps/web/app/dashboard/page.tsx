import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Dashboard } from "../../components/dashboard";
import { getDictionary } from "../../lib/i18n/get-dictionary";
import { resolveLocale } from "../../lib/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = resolveLocale(
    cookieStore.get("rementum_locale")?.value,
    (await headers()).get("accept-language"),
  );
  return { title: getDictionary(locale).dashboard.title };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sharedPage?: string }>;
}) {
  const { page, sharedPage } = await searchParams;
  const cookieStore = await cookies();
  const locale = resolveLocale(
    cookieStore.get("rementum_locale")?.value,
    (await headers()).get("accept-language"),
  );
  return (
    <Dashboard page={page} sharedPage={sharedPage} locale={locale} dict={getDictionary(locale)} />
  );
}
