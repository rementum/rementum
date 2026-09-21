"use client";

import { useState } from "react";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import { Button } from "./pui";
import { CopyButton } from "./ui/copy-button";
import { Field, fieldControlClass } from "./ui/field";

export function InviteMemberForm({ brainId, dict }: { brainId: string; dict: Dictionary }) {
  const strings = dict.brains;
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
    if (!response.ok) setError(body.title ?? strings.inviteOwnerOnly);
    else setUrl(body.acceptanceUrl);
  }
  return (
    <form className="grid gap-3" action={submit}>
      <Field label={strings.email} htmlFor="invite-email">
        <input
          className={fieldControlClass}
          id="invite-email"
          name="email"
          type="email"
          placeholder={strings.emailPlaceholder}
          required
        />
      </Field>
      <Field label={strings.role} htmlFor="invite-role">
        <select className={fieldControlClass} id="invite-role" name="role" defaultValue="editor">
          <option value="editor">{strings.roleEditor}</option>
          <option value="commenter">{strings.roleCommenter}</option>
          <option value="viewer">{strings.roleViewer}</option>
        </select>
      </Field>
      <div>
        <Button variant="solid" size="sm" type="submit">
          {strings.createInvite}
        </Button>
      </div>
      {url ? (
        <output className="grid gap-2 rounded-control border border-green/25 bg-green/10 p-3">
          <a className="text-sm font-medium text-green transition-colors hover:text-ink" href={url}>
            {strings.openInvitation}
          </a>
          <code className="break-all font-mono text-2xs text-ink-2">{url}</code>
          <div>
            <CopyButton dict={dict} text={url} label={strings.copyLink} />
          </div>
        </output>
      ) : null}
      {error ? <p className="text-sm text-red">{error}</p> : null}
    </form>
  );
}
