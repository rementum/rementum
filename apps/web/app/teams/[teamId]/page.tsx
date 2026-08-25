import { TeamManagement } from "../../../components/team-management";
import { api, teamContext } from "../../../lib/api";

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
  const { teams } = await teamContext();
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error("Team was not found");
  const members = await api<Member[]>(`/api/v1/teams/${teamId}/members`);
  const invitations =
    team.role === "member" ? [] : await api<Invitation[]>(`/api/v1/teams/${teamId}/invitations`);
  return (
    <main className="shell management-shell">
      <section className="management-head">
        <div>
          <p className="kicker">Team · {team.role}</p>
          <h1>{team.name}</h1>
          <p>Members share access to every brain in this team.</p>
        </div>
      </section>
      <TeamManagement
        teamId={teamId}
        currentRole={team.role}
        members={members}
        invitations={invitations}
      />
    </main>
  );
}
