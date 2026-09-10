"use client";

import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { Button, CommunityBadge, MockIDE } from "../pui";
import { IconGitHub } from "../ui/icons";
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

export function ConnectTeaser({ githubUrl, dict }: { githubUrl: string; dict: Dictionary }) {
  const section = dict.connectTeaser;
  return (
    <section className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-20" id="connect">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHead kicker={section.kicker} title={section.title}>
            {section.subtitle}
          </SectionHead>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {/* Full-page link: the force-static landing caches the signed-out root layout, so a
                soft nav would strand a signed-in visitor on the public header. */}
            <Button as="a" href="/auth/login" variant="solid" size="lg" sparkle>
              {section.getStarted}
            </Button>
            <CommunityBadge
              href={githubUrl}
              iconNode={<IconGitHub className="size-[18px]" />}
              title={section.starTitle}
              subtitle={section.starSubtitle}
            />
          </div>
        </div>
        <Reveal>
          <MockIDE className="[&_pre]:text-xs/[1.65]" tokens={TOKENS} loop thinkingLabel={false} />
        </Reveal>
      </div>
    </section>
  );
}
