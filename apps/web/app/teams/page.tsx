import Link from "next/link";
import { TeamCreateForm, WorkspaceMcpLink } from "../../components/team-management";
import { workspaceContext } from "../../lib/api";

export default async function TeamsPage() {
  const { teams, workspaces } = await workspaceContext();
  return (
    <main className="shell management-shell">
      <section className="management-head">
        <div>
          <p className="kicker">Collaboration</p>
          <h1>Your teams</h1>
          <p>Teams own membership. Each team can contain multiple isolated workspaces.</p>
        </div>
      </section>
      <TeamCreateForm />
      <section className="team-grid">
        {teams.map((team) => (
          <article className="team-card" key={team.id}>
            <Link className="team-card-main" href={`/teams/${team.id}`}>
              <div className="brain-cell-top">
                <span className="mono">{team.role}</span>
                <span className="open-label">Manage</span>
              </div>
              <div>
                <h2>{team.name}</h2>
                <p>{team.slug}</p>
              </div>
            </Link>
            <div className="team-workspaces">
              {workspaces
                .filter((workspace) => workspace.teamId === team.id)
                .map((workspace) => (
                  <div className="team-workspace-row" key={workspace.id}>
                    <strong>{workspace.name}</strong>
                    <WorkspaceMcpLink url={workspace.mcpUrl} />
                  </div>
                ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
