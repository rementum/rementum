import type { Metadata } from "next";
import { PageHeader } from "../../components/ui/page-header";
import { api, workspaceContext } from "../../lib/api";
import { requestDictionary } from "../../lib/i18n/server";
import { ApiKeyList } from "./api-key-list";
import { ConnectionList } from "./connection-list";

interface Connection {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  resources: Record<string, unknown>;
}

interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
}

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.connections.title };
}

export default async function ConnectionsPage() {
  const { locale, dict } = await requestDictionary();
  const strings = dict.connections;
  const [connections, apiKeys, { teams, workspaces, activeWorkspace }] = await Promise.all([
    api<Connection[]>("/api/v1/connections"),
    api<ApiKey[]>("/api/v1/api-keys"),
    workspaceContext(),
  ]);
  const workspaceOptions = workspaces.map((workspace) => ({
    id: workspace.id,
    label: `${teams.find((team) => team.id === workspace.teamId)?.name ?? ""} / ${workspace.name}`,
    mcpUrl: workspace.mcpUrl,
  }));
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={strings.kicker} title={strings.title} description={strings.description} />
      <div className="mt-8">
        <ConnectionList strings={strings} connections={connections} />
      </div>
      <div className="mt-12">
        <ApiKeyList
          apiKeys={apiKeys}
          workspaces={workspaceOptions}
          defaultWorkspaceId={activeWorkspace?.id ?? workspaces[0]?.id}
          locale={locale}
          dict={dict}
        />
      </div>
    </main>
  );
}
