"use client";

import { useState } from "react";
import { Button } from "../../../../components/pui";
import { ButtonLink } from "../../../../components/ui/button-link";
import { Field, fieldControlClass } from "../../../../components/ui/field";

interface Article {
  id: string;
  brainId: string;
  slug: string;
  title: string;
  body: string;
  kind: "canonical" | "log";
  keywords: string[];
  aliases: string[];
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
        aliases: article.aliases,
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
      <section className="rounded-card border border-green/25 bg-green/10 p-5">
        <h2 className="text-sm font-semibold text-green">Edit staged</h2>
        <p className="mt-1 text-sm text-ink-2">
          Canon is unchanged until this proposal is reviewed.
        </p>
        <div className="mt-4">
          <ButtonLink href={`/writes/${created}`} variant="solid">
            Review staged write
          </ButtonLink>
        </div>
      </section>
    );
  return (
    <form className="flex flex-col gap-5" action={submit}>
      <Field label="Title" htmlFor="article-edit-title">
        <input
          id="article-edit-title"
          className={fieldControlClass}
          name="title"
          defaultValue={article.title}
          required
          maxLength={240}
        />
      </Field>
      <p className="rounded-control border border-dashed border-line bg-inset/50 p-3 text-xs text-ink-2">
        Staging preserves this title and body and creates a local routing summary without calling an
        external LLM. If this workspace enables compaction, promotion queues the version for
        background processing.
      </p>
      <Field label="Keywords" htmlFor="article-edit-keywords">
        <input
          id="article-edit-keywords"
          className={fieldControlClass}
          name="keywords"
          defaultValue={article.keywords.join(", ")}
        />
      </Field>
      <Field label="Markdown body" htmlFor="article-edit-body">
        <textarea
          id="article-edit-body"
          className={`${fieldControlClass} min-h-[60vh] font-mono leading-relaxed`}
          name="body"
          defaultValue={article.body}
          required
          maxLength={2000000}
        />
      </Field>
      <Field label="Change summary" htmlFor="article-edit-change-summary">
        <input
          id="article-edit-change-summary"
          className={fieldControlClass}
          name="changeSummary"
          required
          maxLength={500}
        />
      </Field>
      {error ? (
        <p className="rounded-control border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}
      <Button className="self-start" variant="solid" disabled={busy} type="submit">
        Stage edit
      </Button>
    </form>
  );
}
