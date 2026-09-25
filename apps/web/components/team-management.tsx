"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "../lib/format";
import { type Dictionary, template } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { renderTerms } from "../lib/i18n/terms";
import { Button } from "./pui";
import { Card, CardHeader } from "./ui/card";
import { Chip } from "./ui/chip";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { CopyButton } from "./ui/copy-button";
import { Field, fieldControlClass } from "./ui/field";
import { PageHeader } from "./ui/page-header";

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

async function bridge(errorMessage: string, path: string, method: string, body?: unknown) {
  const response = await fetch(`/bridge${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.title ?? errorMessage);
  return payload;
}

export function TeamCreateForm({ strings }: { strings: Dictionary["teams"] }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const team = await bridge(strings.requestError, "/teams", "POST", {
        name: formData.get("name"),
      });
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
        <Field label={strings.teamName} htmlFor="team-create-name" className="min-w-60 flex-1">
          <input
            id="team-create-name"
            className={fieldControlClass}
            name="name"
            maxLength={160}
            placeholder={strings.teamPlaceholder}
            required
          />
        </Field>
        <Button variant="solid" type="submit" loading={busy}>
          {busy ? strings.creating : strings.createTeam}
        </Button>
        {error ? <p className="w-full text-xs text-red">{error}</p> : null}
      </form>
    </Card>
  );
}

export function TeamHeader({
  teamId,
  name,
  role,
  strings,
}: {
  teamId: string;
  name: string;
  role: "owner" | "admin" | "member";
  strings: Dictionary["teams"];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canRename = role === "owner" || role === "admin";

  async function rename(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      await bridge(strings.requestError, `/teams/${teamId}`, "PATCH", {
        name: formData.get("name"),
      });
      setEditing(false);
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        back={{ href: "/teams", label: strings.title }}
        kicker={template(strings.teamKicker, {
          role: { owner: strings.roleOwner, admin: strings.roleAdmin, member: strings.roleMember }[
            role
          ],
        })}
        title={name}
        description={strings.teamDescription}
        actions={
          canRename ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setError("");
                setEditing(!editing);
              }}
            >
              {editing ? strings.cancel : strings.rename}
            </Button>
          ) : null
        }
      />
      {editing ? (
        <Card className="mt-4">
          <form className="flex flex-wrap items-end gap-3 p-4" action={rename}>
            <Field
              label={strings.teamName}
              htmlFor={`team-rename-${teamId}`}
              className="min-w-60 flex-1"
            >
              <input
                id={`team-rename-${teamId}`}
                className={fieldControlClass}
                name="name"
                defaultValue={name}
                maxLength={160}
                required
              />
            </Field>
            <Button variant="solid" size="sm" type="submit" loading={busy}>
              {busy ? strings.saving : strings.save}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setEditing(false);
              }}
            >
              {strings.cancel}
            </Button>
            {error ? <p className="w-full text-xs text-red">{error}</p> : null}
          </form>
        </Card>
      ) : null}
    </div>
  );
}

export function WorkspaceCreateForm({
  teamId,
  strings,
}: {
  teamId: string;
  strings: Dictionary["teams"];
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const workspace = await bridge(strings.requestError, `/teams/${teamId}/workspaces`, "POST", {
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
        <Field
          label={strings.workspaceName}
          htmlFor="workspace-create-name"
          className="min-w-60 flex-1"
        >
          <input
            id="workspace-create-name"
            className={fieldControlClass}
            name="name"
            maxLength={160}
            placeholder={strings.workspacePlaceholder}
            required
          />
        </Field>
        <Button variant="solid" type="submit" loading={busy}>
          {busy ? strings.creating : strings.createWorkspace}
        </Button>
        {error ? <p className="w-full text-xs text-red">{error}</p> : null}
      </form>
    </Card>
  );
}

export function TeamDangerZone({
  teamId,
  name,
  strings,
}: {
  teamId: string;
  name: string;
  strings: Dictionary["teams"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function confirmDelete(confirmation: string) {
    setBusy(true);
    setError("");
    try {
      await bridge(strings.requestError, `/teams/${teamId}`, "DELETE", { confirmation });
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
          <p className="text-sm font-medium text-ink">{strings.deleteTeamTitle}</p>
          <p className="text-xs text-ink-3">{strings.deleteTeamDescription}</p>
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
          {strings.deleteTeam}
        </button>
        {error ? <p className="w-full text-xs text-red">{error}</p> : null}
      </div>
      <ConfirmDialog
        cancelLabel={strings.cancel}
        open={confirming}
        title={strings.deleteTeamTitle}
        description={strings.deleteTeamDescription}
        confirmLabel={strings.deleteTeam}
        busy={busy}
        error={error}
        confirmationLabel={strings.confirmation}
        confirmationHint={template(strings.confirmationHint, { name })}
        expectedName={name}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

export function WorkspaceMcpLink({
  url,
  dict,
}: {
  url: string;
  dict: Pick<Dictionary, "teams" | "common">;
}) {
  const strings = dict.teams;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        {renderTerms(strings.workspaceMcpUrl)}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-2xs text-ink-2" title={url}>
        {url}
      </code>
      <CopyButton dict={dict} text={url} label={strings.copyUrl} className="shrink-0" />
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
  dict,
}: {
  workspaceId: string;
  name: string;
  slug: string;
  mcpUrl: string;
  canRename: boolean;
  canDelete: boolean;
  dict: Pick<Dictionary, "teams" | "common">;
}) {
  const strings = dict.teams;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function rename(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      await bridge(strings.requestError, `/workspaces/${workspaceId}`, "PATCH", {
        name: formData.get("name"),
      });
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
      await bridge(strings.requestError, `/workspaces/${workspaceId}`, "DELETE", { confirmation });
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
              {editing ? strings.cancel : strings.rename}
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
              {strings.delete}
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form className="flex flex-wrap items-end gap-3" action={rename}>
          <Field
            label={strings.workspaceName}
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
            {busy ? strings.saving : strings.save}
          </Button>
        </form>
      ) : null}
      <WorkspaceMcpLink dict={dict} url={mcpUrl} />
      {error ? <p className="text-xs text-red">{error}</p> : null}
      <ConfirmDialog
        cancelLabel={strings.cancel}
        open={deleting}
        title={strings.deleteWorkspaceTitle}
        description={strings.deleteWorkspaceDescription}
        confirmLabel={strings.deleteWorkspace}
        busy={busy}
        error={error}
        confirmationLabel={strings.confirmation}
        confirmationHint={template(strings.confirmationHint, { name })}
        expectedName={name}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(false)}
      />
    </article>
  );
}

export function TeamManagement({
  teamId,
  currentRole,
  members,
  invitations,
  dict,
  locale,
}: {
  teamId: string;
  currentRole: "owner" | "admin" | "member";
  members: Member[];
  invitations: Invitation[];
  dict: Pick<Dictionary, "teams" | "common">;
  locale: Locale;
}) {
  const strings = dict.teams;
  const roles = { owner: strings.roleOwner, admin: strings.roleAdmin, member: strings.roleMember };
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
      const invitation = await bridge(
        strings.requestError,
        `/teams/${teamId}/invitations`,
        "POST",
        {
          email: formData.get("email"),
          role: formData.get("role"),
        },
      );
      setInviteUrl(invitation.acceptanceUrl);
      if (!invitation.emailSent) setError(strings.inviteEmailError);
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  async function changeRole(userId: string, role: "admin" | "member") {
    setError("");
    try {
      await bridge(strings.requestError, `/teams/${teamId}/members/${userId}`, "PATCH", { role });
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  async function removeMember(userId: string) {
    setActionBusy(true);
    setActionError("");
    try {
      await bridge(strings.requestError, `/teams/${teamId}/members/${userId}`, "DELETE");
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
      const payload = await bridge(strings.requestError, `/team-invitations/${id}/resend`, "POST");
      setInviteUrl(payload.acceptanceUrl);
      if (!payload.emailSent) setError(strings.resendEmailError);
      router.refresh();
    } catch (value) {
      setError((value as Error).message);
    }
  }

  async function revokeInvitation(id: string) {
    setActionBusy(true);
    setActionError("");
    try {
      await bridge(strings.requestError, `/team-invitations/${id}`, "DELETE");
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
            <Field label={strings.email} htmlFor="team-invite-email" className="min-w-60 flex-1">
              <input
                id="team-invite-email"
                className={fieldControlClass}
                name="email"
                type="email"
                required
              />
            </Field>
            <Field label={strings.role} htmlFor="team-invite-role">
              <select
                id="team-invite-role"
                className={fieldControlClass}
                name="role"
                defaultValue="member"
              >
                <option value="member">{strings.roleMember}</option>
                {currentRole === "owner" ? (
                  <option value="admin">{strings.roleAdmin}</option>
                ) : null}
              </select>
            </Field>
            <Button variant="solid" type="submit">
              {strings.sendInvitation}
            </Button>
          </form>
        </Card>
      ) : null}
      {inviteUrl ? (
        <output className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-control border border-green/25 bg-green/10 p-3">
          <span className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-green">
            {renderTerms(strings.invitationLink)}
          </span>
          <a
            className="min-w-0 flex-1 basis-64 break-all font-mono text-2xs text-ink-2 hover:underline"
            href={inviteUrl}
          >
            {inviteUrl}
          </a>
          <CopyButton dict={dict} text={inviteUrl} label={strings.copyLink} className="shrink-0" />
        </output>
      ) : null}
      {error ? <p className="text-xs text-red">{error}</p> : null}

      <Card>
        <CardHeader title={strings.members} count={members.length} />
        <div className="divide-y divide-line">
          {members.map((member) => (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3" key={member.userId}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {member.displayName || member.email}
                </p>
                <p className="truncate font-mono text-2xs text-ink-3">{member.email}</p>
              </div>
              <Chip tone={member.role === "owner" ? "accent" : "neutral"}>
                {roles[member.role]}
              </Chip>
              {currentRole === "owner" && member.role !== "owner" ? (
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    className={GHOST_BUTTON_CLASS}
                    type="button"
                    onClick={() =>
                      changeRole(member.userId, member.role === "admin" ? "member" : "admin")
                    }
                  >
                    {member.role === "admin" ? strings.makeMember : strings.makeAdmin}
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
                    {strings.remove}
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
                  {strings.remove}
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
          <CardHeader title={strings.pendingInvitations} count={invitations.length} />
          <div className="divide-y divide-line">
            {invitations.map((invitation) => (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3" key={invitation.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{invitation.email}</p>
                  <p
                    suppressHydrationWarning
                    className="font-mono text-2xs tabular-nums text-ink-3"
                  >
                    {template(strings.invitationExpires, {
                      date: formatDate(invitation.expiresAt, locale),
                    })}
                  </p>
                </div>
                <Chip>{roles[invitation.role]}</Chip>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    className={GHOST_BUTTON_CLASS}
                    type="button"
                    onClick={() => resendInvitation(invitation.id)}
                  >
                    {strings.resend}
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
                    {strings.revoke}
                  </button>
                </div>
              </div>
            ))}
            {!invitations.length ? (
              <p className="px-4 py-4 text-sm text-ink-2">{strings.noInvitations}</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        cancelLabel={strings.cancel}
        open={pendingAction?.kind === "remove"}
        title={strings.removeMember}
        description={
          pendingAction?.kind === "remove"
            ? template(strings.removeMemberDescription, { name: pendingAction.memberName })
            : ""
        }
        confirmLabel={strings.removeMember}
        busy={actionBusy}
        error={actionError}
        onConfirm={() => {
          if (pendingAction?.kind === "remove") void removeMember(pendingAction.userId);
        }}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        cancelLabel={strings.cancel}
        open={pendingAction?.kind === "revoke"}
        title={strings.revokeInvitation}
        description={
          pendingAction?.kind === "revoke"
            ? template(strings.revokeInvitationDescription, { email: pendingAction.email })
            : ""
        }
        confirmLabel={strings.revokeInvitation}
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
