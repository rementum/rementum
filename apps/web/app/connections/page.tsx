import { PageHeader } from "../../components/ui/page-header";
import { api } from "../../lib/api";
import { ConnectionList } from "./connection-list";

interface Connection {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  resources: Record<string, unknown>;
}

export default async function ConnectionsPage() {
  const connections = await api<Connection[]>("/api/v1/connections");
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        kicker="OAuth grants"
        title="Connections"
        description="Each client has its own revocable grant."
      />
      <div className="mt-8">
        <ConnectionList connections={connections} />
      </div>
    </main>
  );
}
