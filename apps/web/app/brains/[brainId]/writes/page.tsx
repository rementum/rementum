import Link from "next/link";
import { BrainNav } from "../../../../components/brain-nav";
import { StatusPill } from "../../../../components/ui/status-pill";
import { api } from "../../../../lib/api";

interface Write {
  id: string;
  operation: string;
  slug: string;
  title: string;
  status: string;
  changeSummary: string;
  createdAt: string;
  promotedVersion: number | null;
}

export default async function WritesPage({ params }: { params: Promise<{ brainId: string }> }) {
  const { brainId } = await params;
  const [brain, writes] = await Promise.all([
    api<{ brain: { name: string } }>(`/api/v1/brains/${brainId}`),
    api<Write[]>(`/api/v1/brains/${brainId}/writes`),
  ]);
  return (
    <main className="shell management-shell">
      <header className="management-head">
        <div>
          <p className="kicker">{brain.brain.name}</p>
          <h1>Staged writes</h1>
        </div>
        <BrainNav brainId={brainId} />
      </header>
      <section className="management-list">
        {writes.length ? (
          writes.map((write) => (
            <Link className="management-row" href={`/writes/${write.id}`} key={write.id}>
              <StatusPill status={write.status} />
              <div>
                <strong>{write.title}</strong>
                <p>{write.changeSummary}</p>
              </div>
              <div className="row-detail">
                <span>{write.operation}</span>
                <span>{new Date(write.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="empty-inline">
            No staged writes. Connected agents can propose the first change.
          </div>
        )}
      </section>
    </main>
  );
}
