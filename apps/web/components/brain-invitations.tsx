"use client";

import { useState } from "react";
import { relativeTime } from "../lib/format";
import { type Dictionary, template } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { Button } from "./pui";
import { Chip } from "./ui/chip";
import { CopyButton } from "./ui/copy-button";

export interface BrainInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  awaitingApproval: boolean;
  proposedByClient: string | null;
}

/**
 * Invitations an agent proposed over MCP wait here for the owner: approving mints the
 * link and sends it, rejecting discards the proposal. Issued invitations can be revoked.
 */
export function BrainInvitations({
  brainId,
  invitations,
  dict,
  locale,
}: {
  brainId: string;
  invitations: BrainInvitation[];
  dict: Dictionary;
  locale: Locale;
}) {
  const strings = dict.brains;
  const roles: Record<string, string> = {
    owner: strings.roleOwner,
    editor: strings.roleEditor,
    commenter: strings.roleCommenter,
    viewer: strings.roleViewer,
  };
  const [items, setItems] = useState(invitations);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function approve(id: string) {
    setBusy(id);
    setError("");
    const response = await fetch(`/bridge/brains/${brainId}/invitations/${id}/approve`, {
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(body.title ?? strings.approveError);
      return;
    }
    setLinks((current) => ({ ...current, [id]: body.acceptanceUrl }));
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, awaitingApproval: false } : item)),
    );
  }

  async function revoke(id: string) {
    setBusy(id);
    setError("");
    const response = await fetch(`/bridge/brains/${brainId}/invitations/${id}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.title ?? strings.revokeError);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  if (!items.length) return null;
  return (
    <div className="mt-4 rounded-control border border-line bg-surface shadow-hairline">
      <p className="px-3 py-2 font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        {strings.invitations}
      </p>
      <ul className="divide-y divide-line border-t border-dashed border-line">
        {items.map((item) => (
          <li className="grid gap-2 px-3 py-2.5" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{item.email}</p>
                <p className="text-xs text-ink-2">
                  {item.awaitingApproval
                    ? template(strings.invitationProposed, {
                        role: roles[item.role] ?? item.role,
                        client: item.proposedByClient ?? strings.anAgent,
                        time: relativeTime(item.createdAt, locale),
                      })
                    : template(strings.invitationExpires, {
                        role: roles[item.role] ?? item.role,
                        time: relativeTime(item.expiresAt, locale),
                      })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.awaitingApproval ? (
                  <>
                    <Chip tone="orange">{strings.awaitingApproval}</Chip>
                    <Button
                      variant="solid"
                      size="sm"
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => approve(item.id)}
                    >
                      {strings.approve}
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => revoke(item.id)}
                >
                  {item.awaitingApproval ? strings.reject : strings.revoke}
                </Button>
              </div>
            </div>
            {links[item.id] ? (
              <output className="grid gap-2 rounded-control border border-green/25 bg-green/10 p-3">
                <code className="break-all font-mono text-2xs text-ink-2">{links[item.id]}</code>
                <div>
                  <CopyButton dict={dict} text={links[item.id] ?? ""} label={strings.copyLink} />
                </div>
              </output>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="px-3 pb-3 text-sm text-red">{error}</p> : null}
    </div>
  );
}
