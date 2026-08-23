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
    <main className="shell management-shell">
      <header className="management-head">
        <div>
          <p className="kicker">OAuth grants</p>
          <h1>Connected agents</h1>
          <p>Each client has its own revocable grant.</p>
        </div>
      </header>
      <ConnectionList connections={connections} />
    </main>
  );
}
