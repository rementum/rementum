import Link from "next/link";
import { BrainNav } from "../../../../components/brain-nav";
import { Card, CardHeader } from "../../../../components/ui/card";
import { Chip } from "../../../../components/ui/chip";
import { EmptyState } from "../../../../components/ui/empty-state";
import { PageHeader } from "../../../../components/ui/page-header";
import { StatusPill } from "../../../../components/ui/status-pill";
import { api } from "../../../../lib/api";
import { formatDateTime, relativeTime } from "../../../../lib/format";

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
    <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <PageHeader kicker={brain.brain.name} title="Staged writes" />
      <div className="mt-6">
        <BrainNav brainId={brainId} />
      </div>
      <section className="mt-8">
        {writes.length ? (
          <Card>
            <CardHeader title="Proposals" count={writes.length} />
            <div className="divide-y divide-line">
              {writes.map((write) => (
                <Link
                  className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover active:scale-[0.98] ${
                    write.status === "conflicted"
                      ? "border-l-2 border-l-red bg-red/[0.04]"
                      : "border-l-2 border-l-transparent"
                  }`}
                  href={`/writes/${write.id}`}
                  key={write.id}
                >
                  <StatusPill status={write.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{write.title}</p>
                    <p className="truncate text-xs text-ink-2">{write.changeSummary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Chip>{write.operation}</Chip>
                    <time
                      className="font-mono text-2xs tabular-nums text-ink-3"
                      dateTime={write.createdAt}
                      title={formatDateTime(write.createdAt)}
                    >
                      {relativeTime(write.createdAt)}
                    </time>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState
            title="No staged writes."
            body="Connected agents can propose the first change."
          />
        )}
      </section>
    </main>
  );
}
