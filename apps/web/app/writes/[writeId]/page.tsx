import Link from "next/link";
import { Chip } from "../../../components/ui/chip";
import { StatusPill } from "../../../components/ui/status-pill";
import { api } from "../../../lib/api";
import { WriteActions } from "./write-actions";

interface Review {
  write: {
    id: string;
    brainId: string;
    title: string;
    summary: string;
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
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <Link
        className="inline-flex items-center gap-1 font-mono text-2xs text-ink-3 transition-colors hover:text-ink"
        href={`/brains/${review.write.brainId}/writes`}
      >
        ← Staged writes
      </Link>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{review.write.operation}</Chip>
            <StatusPill status={review.write.status} />
          </div>
          <h1 className="mt-2.5 text-[19px] font-semibold tracking-tight text-ink">
            {review.write.title}
          </h1>
          {review.write.summary ? (
            <p className="mt-1.5 max-w-2xl text-sm text-ink-2">{review.write.summary}</p>
          ) : null}
          {review.write.changeSummary ? (
            <p className="mt-1 max-w-2xl text-sm text-ink-3">{review.write.changeSummary}</p>
          ) : null}
        </div>
        <WriteActions writeId={writeId} status={review.write.status} />
      </header>
      {review.write.potentialConflicts.length ? (
        <p className="mt-6 rounded-control border border-orange/30 bg-orange/10 px-3 py-2 text-sm text-orange">
          This proposal has {review.write.potentialConflicts.length} potential knowledge conflicts.
          Read them before promotion.
        </p>
      ) : null}
      <section className="mt-8 overflow-hidden rounded-card bg-inset shadow-hairline">
        <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="min-w-0">
            <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-inset px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-3" />
              Current canon
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap p-4 font-mono text-xs leading-[1.7] text-ink-2">
              {review.currentBody ?? <span className="italic text-ink-3">New article</span>}
            </pre>
          </div>
          <div className="min-w-0 bg-green/[0.03]">
            <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-inset px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-green" />
              Candidate
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap p-4 font-mono text-xs leading-[1.7] text-ink-2">
              {review.candidateBody}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}
