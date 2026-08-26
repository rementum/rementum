"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, WibblingSpinner } from "../../../../components/pui";
import { Card } from "../../../../components/ui/card";
import { Chip } from "../../../../components/ui/chip";
import { EmptyState } from "../../../../components/ui/empty-state";

interface Candidate {
  id: string;
  kind: string;
  articleIds: string[];
  score: number | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export function MaintenanceActions({
  brainId,
  candidates,
}: {
  brainId: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function scan() {
    setBusy("scan");
    const response = await fetch(`/bridge/brains/${brainId}/maintenance/scan`, { method: "POST" });
    if (!response.ok) setError("The maintenance scan failed.");
    else router.refresh();
    setBusy("");
  }
  async function close(id: string, status: "resolved" | "dismissed") {
    setBusy(id);
    const response = await fetch(`/bridge/maintenance/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) setError("Could not update the candidate.");
    else router.refresh();
    setBusy("");
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-2">
          Deterministic checks propose work. They never edit canon.
        </p>
        <div className="flex items-center gap-3">
          {busy === "scan" ? (
            <WibblingSpinner className="text-xs text-ink-3" verbs={["Scanning"]} />
          ) : null}
          <Button
            variant="shimmer"
            size="sm"
            type="button"
            onClick={scan}
            disabled={busy === "scan"}
          >
            Run scan
          </Button>
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
      <section className="mt-6">
        {candidates.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {candidates.map((candidate) => (
              <Card className="flex flex-col p-4" key={candidate.id}>
                <div>
                  <Chip tone="orange" className="border-dashed">
                    {candidate.kind.replaceAll("_", " ")}
                  </Chip>
                </div>
                <h2 className="mt-3 text-sm font-medium text-ink">
                  <span className="tabular-nums">{candidate.articleIds.length}</span> article
                  {candidate.articleIds.length === 1 ? "" : "s"}
                </h2>
                <details className="group mb-4 mt-3">
                  <summary className="cursor-pointer select-none list-none font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Show detail</span>
                    <span className="hidden group-open:inline">Hide detail</span>
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-control bg-inset p-3 font-mono text-2xs leading-relaxed text-ink-2 shadow-hairline">
                    {JSON.stringify(candidate.detail, null, 2)}
                  </pre>
                </details>
                <div className="mt-auto flex items-center gap-2 border-t border-dashed border-line pt-3">
                  <button
                    className="rounded-control px-2 py-1 text-xs font-medium text-green transition-colors hover:bg-green/10 disabled:opacity-50 active:scale-[0.98]"
                    type="button"
                    onClick={() => close(candidate.id, "resolved")}
                    disabled={busy === candidate.id}
                  >
                    Resolved
                  </button>
                  <button
                    className="rounded-control px-2 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50 active:scale-[0.98]"
                    type="button"
                    onClick={() => close(candidate.id, "dismissed")}
                    disabled={busy === candidate.id}
                  >
                    Dismiss
                  </button>
                  {busy === candidate.id ? (
                    <WibblingSpinner className="ml-auto text-xs text-ink-3" verbs={["Updating"]} />
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="No open maintenance candidates." />
        )}
      </section>
    </>
  );
}
