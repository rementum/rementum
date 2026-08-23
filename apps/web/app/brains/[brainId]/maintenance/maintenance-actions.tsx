"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
      <div className="toolbar">
        <p>Deterministic checks propose work. They never edit canon.</p>
        <button className="button" type="button" onClick={scan} disabled={busy === "scan"}>
          Run scan
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <section className="maintenance-grid">
        {candidates.length ? (
          candidates.map((candidate) => (
            <article key={candidate.id}>
              <span className="status unknown">{candidate.kind.replaceAll("_", " ")}</span>
              <h2>
                {candidate.articleIds.length} article{candidate.articleIds.length === 1 ? "" : "s"}
              </h2>
              <pre>{JSON.stringify(candidate.detail, null, 2)}</pre>
              <div>
                <button
                  type="button"
                  onClick={() => close(candidate.id, "resolved")}
                  disabled={busy === candidate.id}
                >
                  Resolved
                </button>
                <button
                  type="button"
                  onClick={() => close(candidate.id, "dismissed")}
                  disabled={busy === candidate.id}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-inline">No open maintenance candidates.</div>
        )}
      </section>
    </>
  );
}
