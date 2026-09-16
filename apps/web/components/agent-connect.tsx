"use client";

import { useState } from "react";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import { CopyButton } from "./ui/copy-button";
import { IconArrowUpRight } from "./ui/icons";

const INTEGRATION_DOCS_URL = "https://rementum.dev/docs/integrations/";

type HarnessId = (typeof HARNESSES)[number]["id"];

const HARNESSES = [
  {
    id: "claude",
    label: "Claude Code",
    commands: (mcpUrl: string) => [
      "/plugin marketplace add rementum/rementum",
      "/plugin install rementum@rementum",
      `claude mcp add --scope user --transport http rementum ${mcpUrl}`,
      "claude mcp login rementum",
    ],
  },
  {
    id: "codex",
    label: "Codex",
    commands: (mcpUrl: string) => [
      "codex plugin marketplace add rementum/rementum",
      "codex plugin add rementum@rementum",
      `codex mcp add rementum --url ${mcpUrl}`,
      "codex mcp login rementum",
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    commands: (mcpUrl: string) => [
      "Dashboard → Plugins → Add Marketplace → Import from Repo",
      "https://github.com/rementum/rementum",
      "Enable Auto Refresh; set Rementum Memory to Default On or Required",
      JSON.stringify({ mcpServers: { rementum: { url: mcpUrl } } }),
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    commands: (mcpUrl: string) => [
      "npx -y skills add rementum/rementum --global --agent opencode --skill '*' --yes --full-depth",
      `opencode mcp add rementum --url ${mcpUrl}`,
      "opencode mcp auth rementum",
    ],
  },
] as const;

export function AgentConnect({
  workspaceName,
  mcpUrl,
  dict,
}: {
  workspaceName: string;
  mcpUrl: string;
  dict: Dictionary;
}) {
  const [active, setActive] = useState<HarnessId>("claude");
  const activeHarness = HARNESSES.find((harness) => harness.id === active) ?? HARNESSES[0];
  const section = dict.agentConnect;

  return (
    <section
      className="grid overflow-hidden rounded-card border border-line bg-surface lg:grid-cols-[260px_minmax(0,1fr)]"
      aria-labelledby="dash-connect-title"
    >
      <div className="border-line border-b p-5 lg:border-r lg:border-b-0">
        <p className="font-mono text-ink-3 text-xs">{section.eyebrow}</p>
        <h2 id="dash-connect-title" className="mt-3 font-semibold text-ink text-lg tracking-tight">
          {section.title.replace("{workspace}", workspaceName)}
        </h2>
        <p className="mt-2 text-ink-2 text-sm">{section.body}</p>
        <a
          className="mt-4 inline-flex items-center gap-1 font-medium text-accent text-sm transition-colors hover:text-ink"
          href={INTEGRATION_DOCS_URL}
          target="_blank"
          rel="noreferrer"
        >
          {section.otherClients} <IconArrowUpRight />
        </a>
      </div>
      <div className="min-w-0 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex flex-wrap items-center gap-1">
            <legend className="sr-only">{section.harnessLegend}</legend>
            {HARNESSES.map((harness) => (
              <button
                key={harness.id}
                type="button"
                aria-pressed={active === harness.id}
                onClick={() => setActive(harness.id)}
                className={`min-h-9 rounded-control px-3 font-medium text-xs transition-colors ${
                  active === harness.id ? "bg-accent-tint text-accent" : "text-ink-3 hover:text-ink"
                }`}
              >
                {harness.label}
              </button>
            ))}
          </fieldset>
          <CopyButton
            text={activeHarness.commands(mcpUrl).join("\n")}
            label={dict.common.copyAll}
            dict={dict}
          />
        </div>
        {HARNESSES.map((harness) => (
          <ol
            key={harness.id}
            hidden={harness.id !== active}
            className="mt-4 flex flex-col gap-2"
            aria-label={`${harness.label} setup commands`}
          >
            {harness.commands(mcpUrl).map((command, index) => (
              <li key={command} className="flex items-center gap-2.5">
                <span className="w-5 shrink-0 text-center font-mono text-2xs text-ink-3 tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-control bg-inset px-3 py-2 font-mono text-ink-2 text-xs leading-relaxed shadow-hairline">
                  <code>{command}</code>
                </pre>
                <CopyButton text={command} className="shrink-0" dict={dict} />
              </li>
            ))}
          </ol>
        ))}
      </div>
    </section>
  );
}
