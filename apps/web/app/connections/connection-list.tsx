"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WibblingSpinner } from "../../components/pui";
import { Card } from "../../components/ui/card";
import { Chip } from "../../components/ui/chip";
import { EmptyState } from "../../components/ui/empty-state";
import type { Dictionary } from "../../lib/i18n/get-dictionary";

interface Connection {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
}

export function ConnectionList({
  connections,
  strings,
}: {
  connections: Connection[];
  strings: Dictionary["connections"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function revoke(id: string) {
    setBusy(id);
    const response = await fetch(`/bridge/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) setError(strings.revokeError);
    else router.refresh();
    setBusy("");
  }
  return (
    <section className="flex flex-col gap-4">
      {error ? <p className="text-xs text-red">{error}</p> : null}
      {connections.length ? (
        connections.map((connection) => (
          <Card key={connection.grantId}>
            <article className="flex flex-wrap items-start gap-3 p-4">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-chip bg-gradient-to-br from-grad-from to-grad-to font-mono text-[11px] font-bold uppercase text-white"
              >
                {connection.clientName.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[15px] font-medium tracking-tight text-ink">
                    {connection.clientName}
                  </h2>
                  <Chip className="max-w-full">
                    <span className="truncate">{connection.clientId}</span>
                  </Chip>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={strings.grantedScopes}>
                  {connection.scopes.map((scope) => (
                    <li key={scope}>
                      <Chip>{scope}</Chip>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-red transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={busy === connection.grantId}
                onClick={() => revoke(connection.grantId)}
              >
                {busy === connection.grantId ? (
                  <WibblingSpinner verbs={[strings.revoking]} />
                ) : (
                  strings.revoke
                )}
              </button>
            </article>
          </Card>
        ))
      ) : (
        <EmptyState title={strings.noConnectionsTitle} body={strings.noConnectionsBody} />
      )}
    </section>
  );
}
