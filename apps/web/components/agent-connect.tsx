"use client";

import { EyebrowPill } from "./pui";
import { CopyButton } from "./ui/copy-button";
import { IconArrowUpRight } from "./ui/icons";

const INTEGRATION_DOCS_URL = "https://yibudak.github.io/rementum/integrations/";

export function AgentConnect({ workspaceName, mcpUrl }: { workspaceName: string; mcpUrl: string }) {
  const commands = [
    {
      id: "claude",
      label: "Claude Code",
      value: `npx -y skills add yibudak/rementum --global --agent claude-code --skill '*' --yes\nclaude mcp add --scope user --transport http rementum ${mcpUrl}\nclaude mcp login rementum`,
    },
    {
      id: "codex",
      label: "Codex",
      value: `npx -y skills add yibudak/rementum --global --agent codex --skill '*' --yes\ncodex mcp add rementum --url ${mcpUrl}\ncodex mcp login rementum`,
    },
  ] as const;

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
          Install the Rementum skills, then connect MCP. Your browser will ask you to approve this
          workspace. Restart the agent when setup completes.
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
      <div className="flex flex-col divide-y divide-dashed divide-line">
        {commands.map((command) => (
          <article className="p-4" key={command.id}>
            <header className="mb-2 flex items-center justify-between">
              <span className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                {command.label}
              </span>
              <CopyButton text={command.value} label="Copy setup" />
            </header>
            <pre className="overflow-x-auto rounded-control bg-inset p-3 font-mono text-xs leading-relaxed text-ink-2 shadow-hairline">
              <code>{command.value}</code>
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}
