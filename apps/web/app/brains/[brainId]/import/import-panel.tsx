"use client";

import { useState } from "react";
import { StatusPill } from "../../../../components/ui/status-pill";

interface Preview {
  files: Array<{
    path: string;
    title: string;
    suggestedKind: string;
    bytes: number;
    warnings: string[];
  }>;
  unresolvedLinks: string[];
  totalBytes: number;
}

export function ImportPanel({ brainId }: { brainId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [writes, setWrites] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(mode: "preview" | "stage") {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/bridge/brains/${brainId}/imports/${mode}`, {
      method: "POST",
      body: form,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.title ?? "Import request failed.");
    else if (mode === "preview") setPreview(body);
    else setWrites(body.writes?.length ?? 0);
    setBusy(false);
  }
  return (
    <section className="import-panel">
      <div className="upload-field">
        <label>
          Obsidian or Markdown ZIP
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setWrites(null);
            }}
          />
        </label>
        <button
          className="button"
          type="button"
          onClick={() => send("preview")}
          disabled={!file || busy}
        >
          Preview
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {preview ? (
        <div className="import-preview">
          <div className="toolbar">
            <p>
              {preview.files.length} Markdown files · {Math.round(preview.totalBytes / 1024)} KB
            </p>
            <button className="button" type="button" onClick={() => send("stage")} disabled={busy}>
              Stage batch
            </button>
          </div>
          {preview.unresolvedLinks.length ? (
            <p className="warning">{preview.unresolvedLinks.length} unresolved wiki-links</p>
          ) : null}
          <div className="management-list">
            {preview.files.map((item) => (
              <div className="management-row" key={item.path}>
                <StatusPill status="unknown" label={item.suggestedKind} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.path}</p>
                </div>
                <span className="mono">{item.warnings.join(", ") || "ready"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {writes !== null ? (
        <p className="form-success">
          {writes} writes staged. Review them in Staged writes before promotion.
        </p>
      ) : null}
    </section>
  );
}
