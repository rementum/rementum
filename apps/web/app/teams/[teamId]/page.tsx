import {
  TeamManagement,
  WorkspaceCreateForm,
  WorkspaceManagement,
} from "../../../components/team-management";
import { Card, CardHeader } from "../../../components/ui/card";
import { PageHeader } from "../../../components/ui/page-header";
import { api, workspaceContext } from "../../../lib/api";

interface Member {
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}
interface Invitation {
  id: string;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
}

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { teams, workspaces } = await workspaceContext();
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error("Team was not found");
  const members = await api<Member[]>(`/api/v1/teams/${teamId}/members`);
  const invitations =
    team.role === "member" ? [] : await api<Invitation[]>(`/api/v1/teams/${teamId}/invitations`);
  const teamWorkspaces = workspaces.filter((workspace) => workspace.teamId === teamId);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        back={{ href: "/teams", label: "Teams" }}
        kicker={`Team · ${team.role}`}
        title={team.name}
        description="Members share access to every workspace and brain in this team."
      />
      <div className="mt-8 flex flex-col gap-6">
        {team.role === "owner" || team.role === "admin" ? (
          <WorkspaceCreateForm teamId={teamId} />
        ) : null}
        <section aria-label="Workspaces">
          <Card>
            <CardHeader title="Workspaces" count={teamWorkspaces.length} />
            <div className="divide-y divide-line">
              {teamWorkspaces.map((workspace) => (
                <WorkspaceManagement
                  key={workspace.id}
                  workspaceId={workspace.id}
                  name={workspace.name}
                  slug={workspace.slug}
                  mcpUrl={workspace.mcpUrl}
                  llmCompactionEnabled={workspace.llmCompactionEnabled}
                  llmCompactionAvailable={workspace.llmCompactionAvailable}
                  canRename={team.role === "owner" || team.role === "admin"}
                  canDelete={team.role === "owner"}
                />
              ))}
            </div>
          </Card>
        </section>
        <TeamManagement
          teamId={teamId}
          currentRole={team.role}
          members={members}
          invitations={invitations}
        />
      </div>
    </main>
  );
}
