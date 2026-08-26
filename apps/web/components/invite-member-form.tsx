"use client";

import { useState } from "react";
import { Button } from "./pui";
import { CopyButton } from "./ui/copy-button";
import { Field, fieldControlClass } from "./ui/field";

export function InviteMemberForm({ brainId }: { brainId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    const response = await fetch(`/bridge/brains/${brainId}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), role: formData.get("role") }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.title ?? "Only the brain owner can invite members.");
    else setUrl(body.acceptanceUrl);
  }
  return (
    <form className="grid gap-3" action={submit}>
      <Field label="Email" htmlFor="invite-email">
        <input
          className={fieldControlClass}
          id="invite-email"
          name="email"
          type="email"
          placeholder="teammate@example.com"
          required
        />
      </Field>
      <Field label="Role" htmlFor="invite-role">
        <select className={fieldControlClass} id="invite-role" name="role" defaultValue="editor">
          <option value="editor">Editor</option>
          <option value="commenter">Commenter</option>
          <option value="viewer">Viewer</option>
        </select>
      </Field>
      <div>
        <Button variant="solid" size="sm" type="submit">
          Create invite
        </Button>
      </div>
      {url ? (
        <output className="grid gap-2 rounded-control border border-green/25 bg-green/10 p-3">
          <a className="text-sm font-medium text-green transition-colors hover:text-ink" href={url}>
            Open invitation
          </a>
          <code className="break-all font-mono text-2xs text-ink-2">{url}</code>
          <div>
            <CopyButton text={url} label="Copy link" />
          </div>
        </output>
      ) : null}
      {error ? <p className="text-sm text-red">{error}</p> : null}
    </form>
  );
}
