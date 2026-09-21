"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/pui";
import { type Dictionary, template } from "../../../lib/i18n/get-dictionary";
import { isReviewable, promoteRequestFor } from "./promote-decision";

export function WriteActions({
  writeId,
  status,
  strings,
}: {
  writeId: string;
  status: string;
  strings: Dictionary["writes"];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Overriding a conflict discards the concurrent change, so it takes a second, deliberate click.
  const [confirmOverride, setConfirmOverride] = useState(false);
  const conflicted = status === "conflicted";

  async function act(action: "promote" | "withdraw") {
    setBusy(true);
    setError("");
    const response = await fetch(`/bridge/writes/${writeId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "promote" ? promoteRequestFor(status) : {}),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.title ?? template(strings.requestError, { status: response.status }));
      setBusy(false);
      return;
    }
    setConfirmOverride(false);
    router.refresh();
    setBusy(false);
  }

  if (!isReviewable(status)) return null;
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <button
          className="rounded-control px-2 py-1 text-sm font-medium text-red transition-colors hover:bg-red/10 disabled:opacity-50 active:scale-[0.98]"
          disabled={busy}
          onClick={() => act("withdraw")}
          type="button"
        >
          {strings.withdraw}
        </button>
        {conflicted && !confirmOverride ? (
          <Button
            variant="solid"
            disabled={busy}
            onClick={() => {
              setError("");
              setConfirmOverride(true);
            }}
            type="button"
          >
            {strings.overridePromote}
          </Button>
        ) : conflicted ? (
          <div className="flex items-center gap-2">
            <button
              className="rounded-control px-2 py-1 text-sm font-medium text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
              disabled={busy}
              onClick={() => setConfirmOverride(false)}
              type="button"
            >
              {strings.cancel}
            </button>
            <Button variant="solid" disabled={busy} onClick={() => act("promote")} type="button">
              {strings.confirmOverride}
            </Button>
          </div>
        ) : (
          <Button variant="solid" disabled={busy} onClick={() => act("promote")} type="button">
            {strings.promote}
          </Button>
        )}
      </div>
      {conflicted && !confirmOverride ? (
        <p className="max-w-72 text-right text-xs text-ink-3">{strings.overrideDescription}</p>
      ) : null}
      {error ? <p className="max-w-64 text-right text-sm text-red">{error}</p> : null}
    </div>
  );
}
