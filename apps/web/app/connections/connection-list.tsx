"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Connection {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
}

export function ConnectionList({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function revoke(id: string) {
    setBusy(id);
    const response = await fetch(`/bridge/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) setError("Could not revoke the connection.");
    else router.refresh();
    setBusy("");
  }
  return (
    <section className="connection-list">
      {error ? <p className="form-error">{error}</p> : null}
      {connections.length ? (
        connections.map((connection) => (
          <article key={connection.grantId}>
            <div>
              <span className="mono">{connection.clientId}</span>
              <h2>{connection.clientName}</h2>
              <p>{connection.scopes.join(" · ")}</p>
            </div>
            <button
              type="button"
              className="text-button"
              disabled={busy === connection.grantId}
              onClick={() => revoke(connection.grantId)}
            >
              Revoke
            </button>
          </article>
        ))
      ) : (
        <div className="empty-inline">
          No connected agents. Add the MCP URL in a client to start OAuth.
        </div>
      )}
    </section>
  );
}
