"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Dictionary } from "../../lib/i18n/get-dictionary";

type Kind = "cmd" | "out" | "ok" | "mut";

interface Line {
  prompt?: string;
  text: string;
  kind: Kind;
}

// The script alternates command/output/ok/mutate; mirrored in the dictionary order.
const KIND_ORDER: Kind[] = ["cmd", "out", "cmd", "out", "cmd", "ok", "cmd", "mut"];

const KIND_CLASSES: Record<Kind, string> = {
  cmd: "text-ink",
  out: "text-ink-3",
  ok: "text-green",
  mut: "text-accent",
};

export function TerminalDemo({ dict }: { dict: Dictionary }) {
  // Commands stay in English; only the human-readable output is translated.
  const SCRIPT: Line[] = dict.hero.terminalSteps.map((step, index) => ({
    ...(step.prompt ? { prompt: step.prompt } : {}),
    text: step.text,
    kind: KIND_ORDER[index % KIND_ORDER.length],
  }));
  const reduce = useReducedMotion();
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: SCRIPT is rebuilt per render from the dictionary; the animation advances on line/chars alone.
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
      <div className="flex items-center border-line border-b px-4 py-2.5">
        <span className="font-mono text-2xs text-ink-3 tracking-[0.08em]">rementum / mcp</span>
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
      {line.prompt ? <span className="mr-2 text-accent">{line.prompt} ❯</span> : null}
      <span>{text}</span>
      {caret ? (
        <span className="ml-0.5 inline-block h-[1.1em] w-[7px] translate-y-[0.2em] animate-caret bg-ink" />
      ) : null}
    </code>
  );
}
