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
      form.action = "/teams/select";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "teamId";
      input.value = team.id;
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
