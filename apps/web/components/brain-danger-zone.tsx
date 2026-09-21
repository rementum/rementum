"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Dictionary, template } from "../lib/i18n/get-dictionary";
import { ConfirmDialog } from "./ui/confirm-dialog";

const DANGER_BUTTON_CLASS =
  "text-xs font-medium text-red transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50";

export function BrainDangerZone({
  brainId,
  name,
  strings,
}: {
  brainId: string;
  name: string;
  strings: Dictionary["brains"];
}) {
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
        setError(body.title ?? strings.deleteOwnerOnly);
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(strings.connectionError);
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-control border border-dashed border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {strings.dangerZone}
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
          {strings.deleteBrain}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red">{error}</p> : null}
      <ConfirmDialog
        open={confirming}
        title={strings.deleteTitle}
        description={strings.deleteDescription}
        confirmLabel={strings.deleteBrain}
        cancelLabel={strings.cancel}
        confirmationLabel={strings.confirmation}
        confirmationHint={template(strings.confirmationHint, { name })}
        busy={busy}
        error={error}
        expectedName={name}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
