"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/pui";

export function WriteActions({ writeId, status }: { writeId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "promote" | "withdraw") {
    setBusy(true);
    setError("");
    const response = await fetch(`/bridge/writes/${writeId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        action === "promote"
          ? { decision: "promote", decisionSummary: "Approved in Rementum web" }
          : {},
      ),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.title ?? `Request failed (${response.status})`);
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }
  if (!["pending", "conflicted"].includes(status)) return null;
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <button
          className="rounded-control px-2 py-1 text-sm font-medium text-red transition-colors hover:bg-red/10 disabled:opacity-50 active:scale-[0.98]"
          disabled={busy}
          onClick={() => act("withdraw")}
          type="button"
        >
          Withdraw
        </button>
        <Button
          variant="glow"
          disabled={busy || status === "conflicted"}
          onClick={() => act("promote")}
          type="button"
        >
          Promote
        </Button>
      </div>
      {error ? <p className="max-w-64 text-right text-sm text-red">{error}</p> : null}
    </div>
  );
}
