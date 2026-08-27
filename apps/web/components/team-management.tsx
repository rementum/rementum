"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "../lib/format";
import { Button } from "./pui";
import { Card, CardHeader } from "./ui/card";
import { Chip } from "./ui/chip";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { CopyButton } from "./ui/copy-button";
import { Field, fieldControlClass } from "./ui/field";

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

const GHOST_BUTTON_CLASS =
  "text-xs font-medium text-ink-2 transition-colors hover:text-ink hover:underline disabled:pointer-events-none disabled:opacity-50";
const DANGER_BUTTON_CLASS =
  "text-xs font-medium text-red transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50";

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
    <Card>
      <form className="flex flex-wrap items-end gap-3 p-4" action={submit}>
        <Field label="Team name" htmlFor="team-create-name" className="min-w-60 flex-1">
          <input
            id="team-create-name"
            className={fieldControlClass}
            name="name"
            maxLength={160}
            placeholder="Product engineering"
            required
          />
        </Field>
        <Button variant="solid" type="submit" loading={busy}>
          {busy ? "Creating…" : "Create team"}
        </Button>
        {error ? <p className="w-full text-xs text-red">{error}</p> : null}
      </form>
    </Card>
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
    <Card>
      <form className="flex flex-wrap items-end gap-3 p-4" action={submit}>
        <Field label="Workspace name" htmlFor="workspace-create-name" className="min-w-60 flex-1">
          <input
            id="workspace-create-name"
            className={fieldControlClass}
            name="name"
            maxLength={160}
            placeholder="Product knowledge"
            required
          />
        </Field>
        <Button variant="solid" type="submit" loading={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
        {error ? <p className="w-full text-xs text-red">{error}</p> : null}
      </form>
    </Card>
  );
}

export function TeamDangerZone({ teamId, name }: { teamId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function confirmDelete(confirmation: string) {
    setBusy(true);
    setError("");
    try {
      await bridge(`/teams/${teamId}`, "DELETE", { confirmation });
      router.push("/teams");
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Delete this team</p>
          <p className="text-xs text-ink-3">
            Permanently removes every workspace, brain, and note in the team. This cannot be undone.
          </p>
        </div>
        <button
          className={DANGER_BUTTON_CLASS}
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            setConfirming(true);
          }}
        >
          Delete team
        </button>
        {error ? <p className="w-full text-xs text-red">{error}</p> : null}
      </div>
      <ConfirmDialog
        open={confirming}
        title="Delete this team"
        description="Permanently removes every workspace, brain, and note in the team. This cannot be undone."
        confirmLabel="Delete team"
        busy={busy}
        error={error}
        expectedName={name}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

export function WorkspaceMcpLink({ url }: { url: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        Workspace MCP URL
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-2xs text-ink-2" title={url}>
        {url}
      </code>
      <CopyButton text={url} label="Copy URL" className="shrink-0" />
    </div>
  );
}

export function WorkspaceManagement({
  workspaceId,
  name,
  slug,
  mcpUrl,
  llmCompactionEnabled,
  llmCompactionAvailable,
  canRename,
  canDelete,
}: {
  workspaceId: string;
  name: string;
  slug: string;
  mcpUrl: string;
  llmCompactionEnabled: boolean;
  llmCompactionAvailable: boolean;
  canRename: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [compacting, setCompacting] = useState(false);

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

  async function confirmDelete(confirmation: string) {
    setBusy(true);
    setError("");
    try {
      await bridge(`/workspaces/${workspaceId}`, "DELETE", { confirmation });
      // Close eagerly: router.refresh() re-enables the confirm button before the
      // deleted row unmounts, which would invite a doomed second delete.
      setDeleting(false);
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCompaction() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await bridge(`/workspaces/${workspaceId}`, "PATCH", {
        llmCompactionEnabled: !llmCompactionEnabled,
      });
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCompact() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await bridge(`/workspaces/${workspaceId}/compactions`, "POST");
      // Close before showing the notice, which renders behind the dialog overlay.
      setCompacting(false);
      setNotice(`${result.queued} article${result.queued === 1 ? "" : "s"} queued.`);
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="truncate font-mono text-2xs text-ink-3">{slug}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canRename ? (
            <button
              className={GHOST_BUTTON_CLASS}
              type="button"
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Cancel" : "Rename"}
            </button>
          ) : null}
          {canDelete ? (
            <button
              className={DANGER_BUTTON_CLASS}
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setDeleting(true);
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form className="flex flex-wrap items-end gap-3" action={rename}>
          <Field
            label="Workspace name"
            htmlFor={`workspace-rename-${workspaceId}`}
            className="min-w-52 flex-1"
          >
            <input
              id={`workspace-rename-${workspaceId}`}
              className={fieldControlClass}
              name="name"
              defaultValue={name}
              maxLength={160}
              required
            />
          </Field>
          <Button variant="solid" size="sm" type="submit" loading={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </form>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-line p-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            LLM compaction
          </p>
          <p className="mt-1 text-xs text-ink-2">
            {llmCompactionEnabled
              ? "New article versions are compacted in the background. Turning this off cancels queued work; a provider request already in flight cannot be recalled."
              : "Off. Titles and bodies stay as submitted and never go to the external LLM."}
          </p>
          {!llmCompactionAvailable ? (
            <small className="mt-1 block text-2xs text-ink-3">
              Configure the instance LLM provider before enabling compaction.
            </small>
          ) : null}
        </div>
        {canRename ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={busy || (!llmCompactionAvailable && !llmCompactionEnabled)}
              onClick={toggleCompaction}
            >
              {llmCompactionEnabled ? "Turn off" : "Turn on"}
            </Button>
            {llmCompactionEnabled ? (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setCompacting(true);
                }}
              >
                Compact existing
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <WorkspaceMcpLink url={mcpUrl} />
      {notice ? <p className="text-xs text-green">{notice}</p> : null}
      {error ? <p className="text-xs text-red">{error}</p> : null}
      <ConfirmDialog
        open={deleting}
        title="Delete this workspace"
        description="Permanently deletes all of its brains and notes. This cannot be undone."
        confirmLabel="Delete workspace"
        busy={busy}
        error={error}
        expectedName={name}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(false)}
      />
      <ConfirmDialog
        open={compacting}
        title="Compact existing articles"
        description="Queue the current version of every uncompacted article in this workspace? Each body will be sent to the configured LLM provider."
        confirmLabel="Queue compaction"
        busy={busy}
        error={error}
        onConfirm={() => confirmCompact()}
        onCancel={() => setCompacting(false)}
      />
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
  const [pendingAction, setPendingAction] = useState<
    | { kind: "remove"; userId: string; memberName: string }
    | { kind: "revoke"; invitationId: string; email: string }
    | null
  >(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
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

  async function removeMember(userId: string) {
    setActionBusy(true);
    setActionError("");
    try {
      await bridge(`/teams/${teamId}/members/${userId}`, "DELETE");
      // router.refresh() keeps client state, so the dialog must close itself.
      setPendingAction(null);
      router.refresh();
    } catch (value) {
      setActionError((value as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  async function resendInvitation(id: string) {
    setError("");
    try {
      const payload = await bridge(`/team-invitations/${id}/resend`, "POST");
      setInviteUrl(payload.acceptanceUrl);
      if (!payload.emailSent)
        setError("Resend could not deliver the email. Share the new link manually.");
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  async function revokeInvitation(id: string) {
    setActionBusy(true);
    setActionError("");
    try {
      await bridge(`/team-invitations/${id}`, "DELETE");
      // router.refresh() keeps client state, so the dialog must close itself.
      setPendingAction(null);
      router.refresh();
    } catch (value) {
      setActionError((value as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      {canManage ? (
        <Card>
          <form className="flex flex-wrap items-end gap-3 p-4" action={invite}>
            <Field label="Email" htmlFor="team-invite-email" className="min-w-60 flex-1">
              <input
                id="team-invite-email"
                className={fieldControlClass}
                name="email"
                type="email"
                required
              />
            </Field>
            <Field label="Role" htmlFor="team-invite-role">
              <select
                id="team-invite-role"
                className={fieldControlClass}
                name="role"
                defaultValue="member"
              >
                <option value="member">Member</option>
                {currentRole === "owner" ? <option value="admin">Admin</option> : null}
              </select>
            </Field>
            <Button variant="solid" type="submit">
              Send invitation
            </Button>
          </form>
        </Card>
      ) : null}
      {inviteUrl ? (
        <output className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-control border border-green/25 bg-green/10 p-3">
          <span className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-green">
            Invitation link
          </span>
          <a
            className="min-w-0 flex-1 basis-64 break-all font-mono text-2xs text-ink-2 hover:underline"
            href={inviteUrl}
          >
            {inviteUrl}
          </a>
          <CopyButton text={inviteUrl} label="Copy link" className="shrink-0" />
        </output>
      ) : null}
      {error ? <p className="text-xs text-red">{error}</p> : null}

      <Card>
        <CardHeader title="Members" count={members.length} />
        <div className="divide-y divide-line">
          {members.map((member) => (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3" key={member.userId}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {member.displayName || member.email}
                </p>
                <p className="truncate font-mono text-2xs text-ink-3">{member.email}</p>
              </div>
              <Chip tone={member.role === "owner" ? "accent" : "neutral"}>{member.role}</Chip>
              {currentRole === "owner" && member.role !== "owner" ? (
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    className={GHOST_BUTTON_CLASS}
                    type="button"
                    onClick={() =>
                      changeRole(member.userId, member.role === "admin" ? "member" : "admin")
                    }
                  >
                    {member.role === "admin" ? "Make member" : "Make admin"}
                  </button>
                  <button
                    className={DANGER_BUTTON_CLASS}
                    type="button"
                    onClick={() => {
                      setActionError("");
                      setPendingAction({
                        kind: "remove",
                        userId: member.userId,
                        memberName: member.displayName || member.email,
                      });
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : currentRole === "admin" && member.role === "member" ? (
                <button
                  className={DANGER_BUTTON_CLASS}
                  type="button"
                  onClick={() => {
                    setActionError("");
                    setPendingAction({
                      kind: "remove",
                      userId: member.userId,
                      memberName: member.displayName || member.email,
                    });
                  }}
                >
                  Remove
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader title="Pending invitations" count={invitations.length} />
          <div className="divide-y divide-line">
            {invitations.map((invitation) => (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3" key={invitation.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{invitation.email}</p>
                  <p
                    suppressHydrationWarning
                    className="font-mono text-2xs tabular-nums text-ink-3"
                  >
                    Expires {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                <Chip>{invitation.role}</Chip>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    className={GHOST_BUTTON_CLASS}
                    type="button"
                    onClick={() => resendInvitation(invitation.id)}
                  >
                    Resend
                  </button>
                  <button
                    className={DANGER_BUTTON_CLASS}
                    type="button"
                    onClick={() => {
                      setActionError("");
                      setPendingAction({
                        kind: "revoke",
                        invitationId: invitation.id,
                        email: invitation.email,
                      });
                    }}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {!invitations.length ? (
              <p className="px-4 py-4 text-sm text-ink-2">No pending invitations.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={pendingAction?.kind === "remove"}
        title="Remove member"
        description={
          pendingAction?.kind === "remove"
            ? `Remove ${pendingAction.memberName} from this team? They will lose access to all of its workspaces and brains.`
            : ""
        }
        confirmLabel="Remove member"
        busy={actionBusy}
        error={actionError}
        onConfirm={() => {
          if (pendingAction?.kind === "remove") void removeMember(pendingAction.userId);
        }}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction?.kind === "revoke"}
        title="Revoke invitation"
        description={
          pendingAction?.kind === "revoke"
            ? `Revoke the pending invitation for ${pendingAction.email}? The acceptance link will stop working.`
            : ""
        }
        confirmLabel="Revoke invitation"
        busy={actionBusy}
        error={actionError}
        onConfirm={() => {
          if (pendingAction?.kind === "revoke") void revokeInvitation(pendingAction.invitationId);
        }}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
