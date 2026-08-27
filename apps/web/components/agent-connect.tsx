"use client";

import { useState } from "react";
import { EyebrowPill } from "./pui";
import { CopyButton } from "./ui/copy-button";
import { IconArrowUpRight } from "./ui/icons";

const INTEGRATION_DOCS_URL = "https://rementum.dev/integrations/";

type HarnessId = (typeof HARNESSES)[number]["id"];

const HARNESSES = [
  {
    id: "claude",
    label: "Claude Code",
    commands: (mcpUrl: string) => [
      "npx -y skills add yibudak/rementum --global --agent claude-code --skill '*' --yes",
      `claude mcp add --scope user --transport http rementum ${mcpUrl}`,
      "claude mcp login rementum",
    ],
  },
  {
    id: "codex",
    label: "Codex",
    commands: (mcpUrl: string) => [
      "npx -y skills add yibudak/rementum --global --agent codex --skill '*' --yes",
      `codex mcp add rementum --url ${mcpUrl}`,
      "codex mcp login rementum",
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    commands: (mcpUrl: string) => [
      "npx -y skills add yibudak/rementum --global --agent opencode --skill '*' --yes",
      `opencode mcp add rementum --url ${mcpUrl}`,
      "opencode mcp auth rementum",
    ],
  },
] as const;

export function AgentConnect({ workspaceName, mcpUrl }: { workspaceName: string; mcpUrl: string }) {
  const [active, setActive] = useState<HarnessId>("claude");
  const activeHarness = HARNESSES.find((harness) => harness.id === active) ?? HARNESSES[0];

  return (
    <section
      className="grid overflow-hidden rounded-card border border-line bg-surface/70 shadow-card backdrop-blur-sm lg:grid-cols-[300px_minmax(0,1fr)]"
      aria-labelledby="dash-connect-title"
    >
      <div className="border-b border-dashed border-line bg-gradient-to-br from-accent-tint to-transparent p-5 lg:border-b-0 lg:border-r">
        <EyebrowPill icon={false}>Workspace MCP</EyebrowPill>
        <h2 id="dash-connect-title" className="mt-3 text-lg font-semibold tracking-tight text-ink">
          Connect {workspaceName} to an agent.
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          Pick your agent, install the Rementum skills, then connect MCP. Your browser will ask you
          to approve this workspace. Restart the agent when setup completes.
        </p>
        <a
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-ink"
          href={INTEGRATION_DOCS_URL}
          target="_blank"
          rel="noreferrer"
        >
          Other clients and setup details <IconArrowUpRight />
        </a>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex items-center gap-0.5 rounded-control border border-line bg-inset p-0.5">
            <legend className="sr-only">Agent harness</legend>
            {HARNESSES.map((harness) => (
              <button
                key={harness.id}
                type="button"
                aria-pressed={active === harness.id}
                onClick={() => setActive(harness.id)}
                className={`h-7 rounded-[7px] px-3 font-mono text-2xs font-semibold uppercase tracking-[0.08em] transition-colors ${
                  active === harness.id
                    ? "bg-surface text-ink shadow-btn"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {harness.label}
              </button>
            ))}
          </fieldset>
          <CopyButton text={activeHarness.commands(mcpUrl).join("\n")} label="Copy all" />
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
                <span className="w-5 shrink-0 text-center font-mono text-2xs tabular-nums text-ink-3">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-control bg-inset px-3 py-2 font-mono text-xs leading-relaxed text-ink-2 shadow-hairline">
                  <code>{command}</code>
                </pre>
                <CopyButton text={command} className="shrink-0" />
              </li>
            ))}
          </ol>
        ))}
      </div>
    </section>
  );
}
