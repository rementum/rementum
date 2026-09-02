"use client";

import { MockIDE } from "../pui";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";

const TOKENS = [
  { c: "❯ ", cls: "str" as const },
  { c: "/plugin ", cls: "key" as const },
  { c: "marketplace add rementum/rementum\n" },
  { c: "❯ ", cls: "str" as const },
  { c: "/plugin ", cls: "key" as const },
  { c: "install rementum@rementum\n" },
  { c: "# skills + MCP tools installed", cls: "com" as const },
  { c: "\n" },
  { c: "❯ ", cls: "str" as const },
  { c: "claude ", cls: "fn" as const },
  { c: "mcp add --transport http rementum " },
  { c: "https://your-host/mcp", cls: "str" as const },
  { c: "\n" },
  { c: "❯ ", cls: "str" as const },
  { c: "claude ", cls: "fn" as const },
  { c: "mcp login rementum\n" },
  { c: "# approved · brain attached", cls: "com" as const },
];

export function ConnectTeaser() {
  return (
    <section className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20" id="connect">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <SectionHead kicker="Plugin + MCP" title="Install the plugin, connect an agent.">
          The plugin adds Rementum's skills and MCP tools to your coding agent. Add your workspace
          URL over OAuth and approve each grant in your browser.
        </SectionHead>
        <Reveal>
          <MockIDE className="[&_pre]:text-xs/[1.65]" tokens={TOKENS} loop thinkingLabel={false} />
        </Reveal>
      </div>
    </section>
  );
}
