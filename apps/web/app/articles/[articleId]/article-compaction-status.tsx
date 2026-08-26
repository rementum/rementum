"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusPill } from "../../../components/ui/status-pill";

export interface ArticleCompaction {
  enabled: boolean;
  available: boolean;
  status: "disabled" | "not_compacted" | "queued" | "processing" | "compacted" | "failed";
  attempts: number;
  error: string | null;
  compactedAt: string | null;
  canRetry: boolean;
}

const labels: Record<ArticleCompaction["status"], string> = {
  disabled: "Compaction off",
  not_compacted: "Not compacted",
  queued: "Compaction queued",
  processing: "Compacting",
  compacted: "Compacted",
  failed: "Compaction failed",
};

export function ArticleCompactionStatus({
  articleId,
  initial,
}: {
  articleId: string;
  initial: ArticleCompaction;
}) {
  const router = useRouter();
  const [compaction, setCompaction] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setCompaction(initial), [initial]);
  useEffect(() => {
    if (!["queued", "processing"].includes(compaction.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/bridge/articles/${articleId}/compaction`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const current = (await response.json()) as ArticleCompaction;
      setCompaction(current);
      if (!["queued", "processing"].includes(current.status)) router.refresh();
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [articleId, compaction.status, router]);

  async function retry() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/bridge/articles/${articleId}/compaction`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.title ?? "Compaction could not be queued.");
      }
      setCompaction((current) => ({ ...current, status: "queued", attempts: 0, error: null }));
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="article-compaction">
      <StatusPill status={compaction.status} label={labels[compaction.status]} />
      {compaction.attempts ? <small>{compaction.attempts}/3 attempts</small> : null}
      {compaction.compactedAt ? (
        <small>{new Date(compaction.compactedAt).toLocaleString()}</small>
      ) : null}
      {compaction.error ? <small className="compaction-error">{compaction.error}</small> : null}
      {compaction.canRetry ? (
        <button className="text-button" type="button" disabled={busy} onClick={retry}>
          {busy ? "Queuing…" : "Retry compaction"}
        </button>
      ) : null}
      {!compaction.available && compaction.enabled ? (
        <small className="compaction-error">The instance LLM provider is unavailable.</small>
      ) : null}
      {error ? <small className="compaction-error">{error}</small> : null}
    </div>
  );
}
