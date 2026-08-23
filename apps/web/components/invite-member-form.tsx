"use client";

import { useState } from "react";

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
    <form className="invite-member" action={submit}>
      <span>Invite teammate</span>
      <label>
        Email
        <input name="email" type="email" placeholder="teammate@example.com" required />
      </label>
      <label>
        Role
        <select name="role" defaultValue="editor">
          <option value="editor">Editor</option>
          <option value="commenter">Commenter</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
      <button type="submit">Create invite</button>
      {url ? (
        <output>
          <a href={url}>Open invitation</a>
          <code>{url}</code>
        </output>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
