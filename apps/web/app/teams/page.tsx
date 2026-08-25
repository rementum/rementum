import Link from "next/link";
import { TeamCreateForm } from "../../components/team-management";
import { teamContext } from "../../lib/api";

export default async function TeamsPage() {
  const { teams } = await teamContext();
  return (
    <main className="shell management-shell">
      <section className="management-head">
        <div>
          <p className="kicker">Collaboration</p>
          <h1>Your teams</h1>
          <p>Create as many teams as you need. Each team owns its brains and membership.</p>
        </div>
      </section>
      <TeamCreateForm />
      <section className="team-grid">
        {teams.map((team) => (
          <Link className="brain-cell" href={`/teams/${team.id}`} key={team.id}>
            <div className="brain-cell-top">
              <span className="mono">{team.role}</span>
              <span className="open-label">Manage</span>
            </div>
            <div>
              <h2>{team.name}</h2>
              <p>{team.slug}</p>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
