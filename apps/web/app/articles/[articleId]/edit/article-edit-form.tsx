"use client";

import { useState } from "react";

interface Article {
  id: string;
  brainId: string;
  slug: string;
  title: string;
  body: string;
  kind: "canonical" | "log";
  keywords: string[];
  currentVersion: number;
}

export function ArticleEditForm({ article }: { article: Article }) {
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    const response = await fetch("/bridge/writes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brainId: article.brainId,
        articleId: article.id,
        operation: "update",
        slug: article.slug,
        title: formData.get("title"),
        keywords: String(formData.get("keywords") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        kind: article.kind,
        body: formData.get("body"),
        baseVersion: article.currentVersion,
        changeSummary: formData.get("changeSummary"),
        sources: [],
        acknowledgePotentialConflicts: true,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.title ?? "Could not stage the edit.");
    else setCreated(body.id);
    setBusy(false);
  }
  if (created)
    return (
      <section className="form-success staged-success">
        <h2>Edit staged</h2>
        <p>Canon is unchanged until this proposal is reviewed.</p>
        <a className="button" href={`/writes/${created}`}>
          Review staged write
        </a>
      </section>
    );
  return (
    <form className="article-edit-form" action={submit}>
      <label>
        Title
        <input name="title" defaultValue={article.title} required maxLength={240} />
      </label>
      <p className="form-note">
        Staging preserves this title and body and creates a local routing summary without calling an
        external LLM. If this workspace enables compaction, promotion queues the version for
        background processing.
      </p>
      <label>
        Keywords
        <input name="keywords" defaultValue={article.keywords.join(", ")} />
      </label>
      <label>
        Markdown body
        <textarea
          className="body-editor"
          name="body"
          defaultValue={article.body}
          required
          maxLength={2000000}
        />
      </label>
      <label>
        Change summary
        <input name="changeSummary" required maxLength={500} />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" disabled={busy} type="submit">
        Stage edit
      </button>
    </form>
  );
}
