import { BrainNav } from "../../../../components/brain-nav";
import { api } from "../../../../lib/api";

interface Activity {
  id: string;
  action: string;
  resource: string;
  actorId: string;
  clientId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export default async function ActivityPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const [brain, activity] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`),
    api<Activity[]>(`/api/v1/brains/${brainId}/activity?limit=200`),
  ]);
  return (
    <main className="shell management-shell">
      <header className="management-head">
        <div>
          <p className="kicker">{brain.brain.name}</p>
          <h1>Activity trail</h1>
        </div>
        <BrainNav brainId={brainId} />
      </header>
      <section className="activity-list">
        {activity.map((event) => (
          <article key={event.id}>
            <time>{new Date(event.createdAt).toLocaleString()}</time>
            <strong>{event.action}</strong>
            <span>{event.resource}</span>
            <code>{event.clientId ?? "web"}</code>
          </article>
        ))}
      </section>
    </main>
  );
}
