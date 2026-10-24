"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, WibblingSpinner } from "../../components/pui";
import { Card } from "../../components/ui/card";
import { Chip } from "../../components/ui/chip";
import { CopyButton } from "../../components/ui/copy-button";
import { EmptyState } from "../../components/ui/empty-state";
import { Field, fieldControlClass } from "../../components/ui/field";
import { formatDate } from "../../lib/format";
import type { Dictionary } from "../../lib/i18n/get-dictionary";
import type { Locale } from "../../lib/i18n/locales";

interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
}

interface WorkspaceOption {
  id: string;
  label: string;
  mcpUrl: string;
}

export function ApiKeyList({
  apiKeys,
  workspaces,
  defaultWorkspaceId,
  locale,
  dict,
}: {
  apiKeys: ApiKey[];
  workspaces: WorkspaceOption[];
  defaultWorkspaceId: string | undefined;
  locale: Locale;
  dict: Dictionary;
}) {
  const strings = dict.connections;
  const router = useRouter();
  const [created, setCreated] = useState<{ key: string; mcpUrl: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const workspaceLabel = (id: string) =>
    workspaces.find((workspace) => workspace.id === id)?.label ?? id;

  async function create(formData: FormData) {
    setError("");
    const workspaceId = String(formData.get("workspaceId"));
    const response = await fetch("/bridge/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: formData.get("name"), workspaceId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.title ?? strings.apiKeyCreateError);
      return;
    }
    const mcpUrl = workspaces.find((workspace) => workspace.id === workspaceId)?.mcpUrl ?? "";
    setCreated({ key: body.key, mcpUrl });
    router.refresh();
  }

  async function revoke(id: string) {
    setBusy(id);
    const response = await fetch(`/bridge/api-keys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) setError(strings.apiKeyRevokeError);
    else router.refresh();
    setBusy("");
  }

  const command = created
    ? `claude mcp add --scope user --transport http rementum ${created.mcpUrl} --header "Authorization: Bearer ${created.key}"`
    : "";

  return (
    <section className="flex flex-col gap-4" aria-labelledby="api-keys-title">
      <div>
        <h2 id="api-keys-title" className="font-semibold text-ink text-lg tracking-tight">
          {strings.apiKeysTitle}
        </h2>
        <p className="mt-1 text-ink-2 text-sm">{strings.apiKeysDescription}</p>
      </div>
      <Card>
        <form className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" action={create}>
          <Field label={strings.apiKeyName} htmlFor="api-key-name">
            <input
              className={fieldControlClass}
              id="api-key-name"
              name="name"
              maxLength={80}
              placeholder={strings.apiKeyNamePlaceholder}
              required
            />
          </Field>
          <Field label={strings.apiKeyWorkspace} htmlFor="api-key-workspace">
            <select
              className={fieldControlClass}
              id="api-key-workspace"
              name="workspaceId"
              defaultValue={defaultWorkspaceId}
              required
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.label}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <Button variant="solid" size="sm" type="submit">
              {strings.apiKeyCreate}
            </Button>
          </div>
        </form>
      </Card>
      {created ? (
        <output className="grid gap-2 rounded-control border border-green/25 bg-green/10 p-3">
          <p className="font-medium text-green text-sm">{strings.apiKeyShownOnce}</p>
          <code className="break-all font-mono text-2xs text-ink">{created.key}</code>
          <div>
            <CopyButton dict={dict} text={created.key} label={strings.apiKeyCopy} />
          </div>
          <p className="text-ink-2 text-xs">{strings.apiKeyClaudeCode}</p>
          <code className="break-all font-mono text-2xs text-ink-2">{command}</code>
          <div>
            <CopyButton dict={dict} text={command} />
          </div>
        </output>
      ) : null}
      {error ? <p className="text-red text-xs">{error}</p> : null}
      {apiKeys.length ? (
        apiKeys.map((apiKey) => (
          <Card key={apiKey.id}>
            <article className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium text-[15px] text-ink tracking-tight">
                    {apiKey.name}
                  </h3>
                  <Chip className="max-w-full">
                    <span className="truncate">{workspaceLabel(apiKey.workspaceId)}</span>
                  </Chip>
                </div>
                <p className="mt-1 text-ink-3 text-xs">
                  {strings.apiKeyCreated.replace("{date}", formatDate(apiKey.createdAt, locale))}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 font-medium text-red text-xs transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={busy === apiKey.id}
                onClick={() => revoke(apiKey.id)}
              >
                {busy === apiKey.id ? (
                  <WibblingSpinner verbs={[strings.revoking]} />
                ) : (
                  strings.revoke
                )}
              </button>
            </article>
          </Card>
        ))
      ) : (
        <EmptyState title={strings.noApiKeysTitle} body={strings.noApiKeysBody} />
      )}
    </section>
  );
}
