import type { Metadata } from "next";
import { PageHeader } from "../../components/ui/page-header";
import { api } from "../../lib/api";
import { requestDictionary } from "../../lib/i18n/server";
import { ConnectionList } from "./connection-list";

interface Connection {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  resources: Record<string, unknown>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.connections.title };
}

export default async function ConnectionsPage() {
  const { dict } = await requestDictionary();
  const strings = dict.connections;
  const connections = await api<Connection[]>("/api/v1/connections");
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={strings.kicker} title={strings.title} description={strings.description} />
      <div className="mt-8">
        <ConnectionList strings={strings} connections={connections} />
      </div>
    </main>
  );
}
