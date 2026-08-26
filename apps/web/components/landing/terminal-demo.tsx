"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type Kind = "cmd" | "out" | "ok" | "mut";

interface Line {
  prompt?: string;
  text: string;
  kind: Kind;
}

const SCRIPT: Line[] = [
  { prompt: "agent@rementum", text: "search_articles 'staged write conflict policy'", kind: "cmd" },
  { text: "4 matches · routing index scan", kind: "out" },
  { prompt: "agent@rementum", text: "read_article 'write-promotion-policy'", kind: "cmd" },
  { text: "v2 · current · 2 sources", kind: "out" },
  { prompt: "agent@rementum", text: "stage_write baseVersion=2 ...", kind: "cmd" },
  { text: "staged · conflict-free · writeId 9c4f", kind: "ok" },
  { prompt: "agent@rementum", text: "promote_staged_write 9c4f", kind: "cmd" },
  { text: "promoted → canon v3 · audit recorded", kind: "mut" },
];

const KIND_CLASSES: Record<Kind, string> = {
  cmd: "text-ink",
  out: "text-ink-3",
  ok: "text-green",
  mut: "text-accent",
};

export function TerminalDemo() {
  const reduce = useReducedMotion();
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (reduce) return;
    if (line >= SCRIPT.length) {
      const reset = setTimeout(() => {
        setLine(0);
        setChars(0);
      }, 2600);
      return () => clearTimeout(reset);
    }
    const full = SCRIPT[line].text;
    if (chars < full.length) {
      const t = setTimeout(() => setChars((c) => c + 1), 34);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setLine((l) => l + 1);
      setChars(0);
    }, 480);
    return () => clearTimeout(t);
  }, [line, chars, reduce]);

  const visible = reduce ? SCRIPT.length : line;

  return (
    <div aria-hidden="true">
      <div className="flex items-center border-b border-line px-4 py-2.5">
        <span className="font-mono text-2xs tracking-[0.08em] text-ink-3">rementum / mcp</span>
      </div>
      <pre className="min-h-[264px] overflow-x-auto px-4 py-3 font-mono text-xs leading-7">
        {SCRIPT.slice(0, visible).map((l) => (
          <TerminalLine key={l.text} line={l} text={l.text} />
        ))}
        {!reduce && line < SCRIPT.length ? (
          <TerminalLine line={SCRIPT[line]} text={SCRIPT[line].text.slice(0, chars)} caret />
        ) : null}
      </pre>
    </div>
  );
}

function TerminalLine({ line, text, caret }: { line: Line; text: string; caret?: boolean }) {
  return (
    <code className={`block ${KIND_CLASSES[line.kind]}`}>
      {line.prompt ? (
        <span className="mr-2">
          <span className="text-grad-mid">{line.prompt.split("@")[0]}</span>
          <span className="text-ink-3">@</span>
          <span className="text-accent">{line.prompt.split("@")[1]}</span>
          <span className="ml-1.5 text-ink-3">❯</span>
        </span>
      ) : null}
      <span>{text}</span>
      {caret ? (
        <span className="ml-0.5 inline-block h-[1.1em] w-[7px] translate-y-[0.2em] animate-caret bg-ink" />
      ) : null}
    </code>
  );
}
