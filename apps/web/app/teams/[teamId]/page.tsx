import type { Metadata } from "next";
import {
  TeamDangerZone,
  TeamHeader,
  TeamManagement,
  WorkspaceCreateForm,
  WorkspaceManagement,
} from "../../../components/team-management";
import { Card, CardHeader } from "../../../components/ui/card";
import { api, workspaceContext } from "../../../lib/api";
import { requestDictionary } from "../../../lib/i18n/server";

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

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await requestDictionary();
  return { title: dict.teams.title };
}

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { locale, dict } = await requestDictionary();
  const strings = dict.teams;
  const { teamId } = await params;
  const { teams, workspaces } = await workspaceContext();
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error(strings.notFound);
  const members = await api<Member[]>(`/api/v1/teams/${teamId}/members`);
  const invitations =
    team.role === "member" ? [] : await api<Invitation[]>(`/api/v1/teams/${teamId}/invitations`);
  const teamWorkspaces = workspaces.filter((workspace) => workspace.teamId === teamId);
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <TeamHeader strings={strings} teamId={teamId} name={team.name} role={team.role} />
      <div className="mt-8 flex flex-col gap-6">
        {team.role === "owner" || team.role === "admin" ? (
          <WorkspaceCreateForm strings={strings} teamId={teamId} />
        ) : null}
        <section aria-label={strings.workspaces}>
          <Card>
            <CardHeader title={strings.workspaces} count={teamWorkspaces.length} />
            <div className="divide-y divide-line">
              {teamWorkspaces.map((workspace) => (
                <WorkspaceManagement
                  dict={{ teams: strings, common: dict.common }}
                  key={workspace.id}
                  workspaceId={workspace.id}
                  name={workspace.name}
                  slug={workspace.slug}
                  mcpUrl={workspace.mcpUrl}
                  canRename={team.role === "owner" || team.role === "admin"}
                  canDelete={team.role === "owner"}
                />
              ))}
            </div>
          </Card>
        </section>
        <TeamManagement
          dict={{ teams: strings, common: dict.common }}
          locale={locale}
          teamId={teamId}
          currentRole={team.role}
          members={members}
          invitations={invitations}
        />
        {team.role === "owner" ? (
          <TeamDangerZone strings={strings} teamId={teamId} name={team.name} />
        ) : null}
      </div>
    </main>
  );
}
