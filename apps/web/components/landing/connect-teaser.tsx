"use client";

import { MockIDE } from "../pui";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";

const TOKENS = [
  { c: "❯ ", cls: "str" as const },
  { c: "claude ", cls: "fn" as const },
  { c: "mcp add --transport http rementum \\\n  " },
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
        <SectionHead kicker="MCP-native" title="Connect an agent in two commands.">
          OAuth gives each client its own revocable access to the workspace. You approve each grant
          in your browser.
        </SectionHead>
        <Reveal>
          <MockIDE tokens={TOKENS} loop thinkingLabel={false} />
        </Reveal>
      </div>
    </section>
  );
}
