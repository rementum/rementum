import type { Metadata } from "next";
import { Dashboard } from "../../components/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sharedPage?: string }>;
}) {
  const { page, sharedPage } = await searchParams;
  return <Dashboard page={page} sharedPage={sharedPage} />;
}
