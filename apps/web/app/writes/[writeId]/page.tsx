import Link from "next/link";
import { api } from "../../../lib/api";
import { WriteActions } from "./write-actions";

interface Review {
  write: {
    id: string;
    brainId: string;
    title: string;
    status: string;
    operation: string;
    changeSummary: string;
    potentialConflicts: unknown[];
  };
  currentBody: string | null;
  candidateBody: string;
}

export default async function WritePage({ params }: { params: Promise<{ writeId: string }> }) {
  const { writeId } = await params;
  const review = await api<Review>(`/api/v1/writes/${writeId}/review`);
  return (
    <main className="shell management-shell">
      <Link className="back" href={`/brains/${review.write.brainId}/writes`}>
        ← Staged writes
      </Link>
      <header className="write-head">
        <div>
          <p className="kicker">
            {review.write.operation} · {review.write.status}
          </p>
          <h1>{review.write.title}</h1>
          <p>{review.write.changeSummary}</p>
        </div>
        <WriteActions writeId={writeId} status={review.write.status} />
      </header>
      {review.write.potentialConflicts.length ? (
        <p className="warning">
          This proposal has {review.write.potentialConflicts.length} potential knowledge conflicts.
          Read them before promotion.
        </p>
      ) : null}
      <section className="diff-grid">
        <div>
          <span>Current canon</span>
          <pre>{review.currentBody ?? "New article"}</pre>
        </div>
        <div>
          <span>Candidate</span>
          <pre>{review.candidateBody}</pre>
        </div>
      </section>
    </main>
  );
}
