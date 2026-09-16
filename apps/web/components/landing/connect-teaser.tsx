import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { DOCS_URL } from "../../lib/site";
import { CopyButton } from "../ui/copy-button";
import { IconArrowUpRight } from "../ui/icons";
import { SectionHead } from "./section-head";

const COMMANDS = [
  "/plugin marketplace add rementum/rementum",
  "/plugin install rementum@rementum",
  "claude mcp add --scope user --transport http rementum https://your-host/mcp/workspace/WORKSPACE_ID",
  "claude mcp login rementum",
].join("\n");

export function ConnectTeaser({ dict }: { dict: Dictionary }) {
  const section = dict.connectTeaser;
  return (
    <section className="landing-section" id="connect">
      <SectionHead title={section.title}>{section.subtitle}</SectionHead>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-12">
        <div className="surface-panel min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-line border-b px-5 py-3">
            <p className="font-mono text-ink-2 text-xs">{section.setupLabel}</p>
            <CopyButton text={COMMANDS} label={dict.common.copyAll} dict={dict} />
          </div>
          <section
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard access to scrolling commands
            tabIndex={0}
            className="overflow-x-auto p-5 font-mono text-ink-2 text-xs leading-[2]"
            aria-label={section.commandsLabel}
          >
            <pre>
              <code>{COMMANDS}</code>
            </pre>
          </section>
        </div>
        <aside className="rounded-card bg-accent-tint p-5 text-sm text-ink-2 leading-relaxed">
          <p>{section.aside}</p>
          <a
            href={`${DOCS_URL}integrations/`}
            className="mt-4 inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
          >
            {section.otherClients} <IconArrowUpRight />
          </a>
        </aside>
      </div>
    </section>
  );
}
