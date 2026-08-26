"use client";

import { useState } from "react";

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
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setCopyError(null);
    } catch {
      setCopied(null);
      setCopyError(id);
    }
  }

  return (
    <section className="dash-connect" aria-labelledby="dash-connect-title">
      <div className="dash-connect-copy">
        <p className="kicker">Workspace MCP</p>
        <h2 id="dash-connect-title">Connect {workspaceName} to an agent.</h2>
        <p>
          Install the Rementum skills, then connect MCP. Your browser will ask you to approve this
          workspace. Restart the agent when setup completes.
        </p>
        <a href={INTEGRATION_DOCS_URL} target="_blank" rel="noreferrer">
          Other clients and setup details <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="dash-connect-commands">
        {commands.map((command) => (
          <article className="dash-command" key={command.id}>
            <header>
              <span>{command.label}</span>
              <button type="button" onClick={() => copy(command.id, command.value)}>
                {copied === command.id ? "Copied" : "Copy setup"}
              </button>
            </header>
            <pre>
              <code>{command.value}</code>
            </pre>
            {copyError === command.id ? (
              <small>Copy failed. Select the commands manually.</small>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
