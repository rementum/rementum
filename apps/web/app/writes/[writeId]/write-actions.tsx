"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill } from "../../../components/ui/status-pill";

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
  if (!["pending", "conflicted"].includes(status)) return <StatusPill status={status} />;
  return (
    <div className="action-stack">
      <button
        className="button"
        disabled={busy || status === "conflicted"}
        onClick={() => act("promote")}
        type="button"
      >
        Promote
      </button>
      <button className="text-button" disabled={busy} onClick={() => act("withdraw")} type="button">
        Withdraw
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
