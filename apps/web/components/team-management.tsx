"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Member {
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
}

async function bridge(path: string, method: string, body?: unknown) {
  const response = await fetch(`/bridge${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.title ?? "The request could not be completed.");
  return payload;
}

export function TeamCreateForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const team = await bridge("/teams", "POST", { name: formData.get("name") });
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/workspaces/select";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "workspaceId";
      input.value = team.defaultWorkspaceId;
      form.append(input);
      document.body.append(form);
      form.submit();
    } catch (value) {
      setError((value as Error).message);
      setBusy(false);
    }
  }
  return (
    <form className="team-create" action={submit}>
      <label>
        Team name
        <input name="name" maxLength={160} placeholder="Product engineering" required />
      </label>
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create team"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

export function WorkspaceCreateForm({ teamId }: { teamId: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const workspace = await bridge(`/teams/${teamId}/workspaces`, "POST", {
        name: formData.get("name"),
      });
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/workspaces/select";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "workspaceId";
      input.value = workspace.id;
      form.append(input);
      document.body.append(form);
      form.submit();
    } catch (value) {
      setError((value as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="team-create" action={submit}>
      <label>
        Workspace name
        <input name="name" maxLength={160} placeholder="Product knowledge" required />
      </label>
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create workspace"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

export function WorkspaceMcpLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <div className="workspace-mcp-link">
      <span>Workspace MCP URL</span>
      <code title={url}>{url}</code>
      <button className="text-button" type="button" onClick={copy}>
        {copied ? "Copied" : "Copy URL"}
      </button>
      {copyError ? <small>Copy failed. Select the URL manually.</small> : null}
    </div>
  );
}

export function WorkspaceManagement({
  workspaceId,
  name,
  slug,
  mcpUrl,
  canRename,
  canDelete,
}: {
  workspaceId: string;
  name: string;
  slug: string;
  mcpUrl: string;
  canRename: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function rename(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      await bridge(`/workspaces/${workspaceId}`, "PATCH", { name: formData.get("name") });
      setEditing(false);
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const confirmation = window.prompt(
      `Deleting this workspace permanently deletes all of its brains and notes. Type "${name}" to continue.`,
    );
    if (confirmation === null) return;
    setBusy(true);
    setError("");
    try {
      await bridge(`/workspaces/${workspaceId}`, "DELETE", { confirmation });
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="team-workspace-row">
      <div className="workspace-row-head">
        <div>
          <strong>{name}</strong>
          <p>{slug}</p>
        </div>
        <div className="row-actions">
          {canRename ? (
            <button className="text-button" type="button" onClick={() => setEditing(!editing)}>
              {editing ? "Cancel" : "Rename"}
            </button>
          ) : null}
          {canDelete ? (
            <button
              className="text-button danger-button"
              type="button"
              disabled={busy}
              onClick={remove}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form className="workspace-rename-form" action={rename}>
          <input name="name" defaultValue={name} maxLength={160} required />
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      ) : null}
      <WorkspaceMcpLink url={mcpUrl} />
      {error ? <p className="form-error">{error}</p> : null}
    </article>
  );
}

export function TeamManagement({
  teamId,
  currentRole,
  members,
  invitations,
}: {
  teamId: string;
  currentRole: "owner" | "admin" | "member";
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const canManage = currentRole === "owner" || currentRole === "admin";

  async function invite(formData: FormData) {
    setError("");
    try {
      const invitation = await bridge(`/teams/${teamId}/invitations`, "POST", {
        email: formData.get("email"),
        role: formData.get("role"),
      });
      setInviteUrl(invitation.acceptanceUrl);
      if (!invitation.emailSent)
        setError("Resend could not deliver the email. Share the link below manually.");
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  async function changeRole(userId: string, role: "admin" | "member") {
    setError("");
    try {
      await bridge(`/teams/${teamId}/members/${userId}`, "PATCH", { role });
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  async function remove(userId: string) {
    setError("");
    try {
      await bridge(`/teams/${teamId}/members/${userId}`, "DELETE");
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  async function invitationAction(id: string, action: "resend" | "revoke") {
    setError("");
    try {
      const payload = await bridge(
        `/team-invitations/${id}${action === "resend" ? "/resend" : ""}`,
        action === "resend" ? "POST" : "DELETE",
      );
      if (action === "resend") {
        setInviteUrl(payload.acceptanceUrl);
        if (!payload.emailSent)
          setError("Resend could not deliver the email. Share the new link manually.");
      }
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  return (
    <>
      {canManage ? (
        <form className="team-invite-form" action={invite}>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Role
            <select name="role" defaultValue="member">
              <option value="member">Member</option>
              {currentRole === "owner" ? <option value="admin">Admin</option> : null}
            </select>
          </label>
          <button className="button" type="submit">
            Send invitation
          </button>
        </form>
      ) : null}
      {inviteUrl ? (
        <output className="invite-output">
          <span>Invitation link</span>
          <a href={inviteUrl}>{inviteUrl}</a>
        </output>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="team-section">
        <div className="section-title">
          <h2>Members</h2>
          <span>{members.length}</span>
        </div>
        <div className="management-list">
          {members.map((member) => (
            <div className="team-member-row" key={member.userId}>
              <div>
                <strong>{member.displayName || member.email}</strong>
                <p>{member.email}</p>
              </div>
              <span className="role-badge">{member.role}</span>
              {currentRole === "owner" && member.role !== "owner" ? (
                <div className="row-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      changeRole(member.userId, member.role === "admin" ? "member" : "admin")
                    }
                  >
                    {member.role === "admin" ? "Make member" : "Make admin"}
                  </button>
                  <button
                    className="text-button danger-button"
                    type="button"
                    onClick={() => remove(member.userId)}
                  >
                    Remove
                  </button>
                </div>
              ) : currentRole === "admin" && member.role === "member" ? (
                <button
                  className="text-button danger-button"
                  type="button"
                  onClick={() => remove(member.userId)}
                >
                  Remove
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      </section>

      {canManage ? (
        <section className="team-section">
          <div className="section-title">
            <h2>Pending invitations</h2>
            <span>{invitations.length}</span>
          </div>
          <div className="management-list">
            {invitations.map((invitation) => (
              <div className="team-member-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <p>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                </div>
                <span className="role-badge">{invitation.role}</span>
                <div className="row-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => invitationAction(invitation.id, "resend")}
                  >
                    Resend
                  </button>
                  <button
                    className="text-button danger-button"
                    type="button"
                    onClick={() => invitationAction(invitation.id, "revoke")}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {!invitations.length ? <p className="empty-inline">No pending invitations.</p> : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
