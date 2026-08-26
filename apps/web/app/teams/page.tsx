import Link from "next/link";
import { TeamCreateForm, WorkspaceMcpLink } from "../../components/team-management";
import { Card } from "../../components/ui/card";
import { Chip } from "../../components/ui/chip";
import { PageHeader } from "../../components/ui/page-header";
import { workspaceContext } from "../../lib/api";

export default async function TeamsPage() {
  const { teams, workspaces } = await workspaceContext();
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader
        kicker="Collaboration"
        title="Teams"
        description="Teams own membership. Each team can contain multiple isolated workspaces."
      />
      <div className="mt-8">
        <TeamCreateForm />
      </div>
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {teams.map((team) => (
          <Card className="flex flex-col" interactive key={team.id}>
            <Link
              className="group flex items-start gap-3 rounded-t-card p-4 transition-all hover:bg-hover active:scale-[0.98]"
              href={`/teams/${team.id}`}
            >
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-chip bg-gradient-to-br from-grad-from to-grad-to font-mono text-[11px] font-bold uppercase text-white"
              >
                {team.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
                    {team.name}
                  </span>
                  <Chip tone={team.role === "owner" ? "accent" : "neutral"}>{team.role}</Chip>
                </span>
                <Chip className="mt-1.5 max-w-full">
                  <span className="truncate">{team.slug}</span>
                </Chip>
              </span>
              <span className="shrink-0 text-xs font-medium text-ink-3 transition-colors group-hover:text-ink">
                Manage →
              </span>
            </Link>
            <div className="flex flex-col divide-y divide-dashed divide-line border-t border-dashed border-line">
              {workspaces
                .filter((workspace) => workspace.teamId === team.id)
                .map((workspace) => (
                  <div className="flex min-w-0 flex-col gap-1.5 px-4 py-3" key={workspace.id}>
                    <p className="truncate text-sm font-medium text-ink">{workspace.name}</p>
                    <WorkspaceMcpLink url={workspace.mcpUrl} />
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
