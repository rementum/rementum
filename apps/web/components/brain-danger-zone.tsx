"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ui/confirm-dialog";

const DANGER_BUTTON_CLASS =
  "text-xs font-medium text-red transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50";

export function BrainDangerZone({ brainId, name }: { brainId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function confirmDelete(confirmation: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/bridge/brains/${brainId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.title ?? "Only the brain owner can delete it.");
        setBusy(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("The request could not be completed. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-control border border-dashed border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Danger zone
        </span>
        <button
          className={DANGER_BUTTON_CLASS}
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            setConfirming(true);
          }}
        >
          Delete brain
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red">{error}</p> : null}
      <ConfirmDialog
        open={confirming}
        title="Delete this brain"
        description="Permanently deletes every article and note in it. This cannot be undone."
        confirmLabel="Delete brain"
        busy={busy}
        error={error}
        expectedName={name}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
