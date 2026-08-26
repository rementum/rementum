"use client";

import { useState } from "react";
import { Button, Sparkle, WibblingSpinner } from "../../../../components/pui";
import { Card } from "../../../../components/ui/card";
import { Chip } from "../../../../components/ui/chip";
import { IconImport } from "../../../../components/ui/icons";

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
    <section>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line px-6 py-12 text-center transition-colors hover:border-accent/40">
        <IconImport className="text-ink-3" />
        <span className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
          Obsidian or Markdown ZIP
        </span>
        {file ? (
          <span className="font-mono text-xs text-ink">{file.name}</span>
        ) : (
          <span className="text-xs text-ink-3">Choose a .zip archive to inspect</span>
        )}
        <input
          className="sr-only"
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPreview(null);
            setWrites(null);
          }}
        />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => send("preview")}
          disabled={!file || busy}
        >
          Preview
        </Button>
        {busy ? <WibblingSpinner className="text-xs text-ink-3" verbs={["Importing"]} /> : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
      {preview ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs tabular-nums text-ink-2">
              {preview.files.length} Markdown files · {Math.round(preview.totalBytes / 1024)} KB
            </p>
            <Button
              variant="solid"
              size="sm"
              type="button"
              onClick={() => send("stage")}
              disabled={busy}
            >
              Stage batch
            </Button>
          </div>
          {preview.unresolvedLinks.length ? (
            <p className="mt-3 rounded-control border border-orange/30 bg-orange/10 px-3 py-2 text-sm text-orange">
              {preview.unresolvedLinks.length} unresolved wiki-links
            </p>
          ) : null}
          <Card className="mt-4">
            <div className="divide-y divide-line">
              {preview.files.map((item) => (
                <div className="flex items-center gap-4 px-4 py-3" key={item.path}>
                  <Chip className="shrink-0">{item.suggestedKind}</Chip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                    <p className="truncate font-mono text-2xs text-ink-3">{item.path}</p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-2xs ${
                      item.warnings.length ? "text-orange" : "text-green"
                    }`}
                  >
                    {item.warnings.join(", ") || "ready"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
      {writes !== null ? (
        <p className="mt-4 flex items-center gap-2 rounded-control border border-green/25 bg-green/10 px-3 py-2 text-sm text-green">
          <Sparkle />
          <span>
            <span className="tabular-nums">{writes}</span> writes staged. Review them in Staged
            writes before promotion.
          </span>
        </p>
      ) : null}
    </section>
  );
}
