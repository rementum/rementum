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
  { prompt: "agent", text: "search_articles 'staged write conflict policy'", kind: "cmd" },
  { text: "4 matches · routing index scan", kind: "out" },
  { prompt: "agent", text: "read_article 'write-promotion-policy'", kind: "cmd" },
  { text: "v2 · current · 2 sources", kind: "out" },
  { prompt: "agent", text: "stage_write baseVersion=2 ...", kind: "cmd" },
  { text: "staged · conflict-free · writeId 9c4f", kind: "ok" },
  { prompt: "agent", text: "promote_staged_write 9c4f", kind: "cmd" },
  { text: "promoted → canon v3 · audit recorded", kind: "mut" },
];

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
    <div className="terminal" aria-hidden="true">
      <div className="terminal-bar">
        <span className="terminal-dot terminal-dot-red" />
        <span className="terminal-dot terminal-dot-amber" />
        <span className="terminal-dot terminal-dot-green" />
        <span className="terminal-title">owl-memory · mcp</span>
      </div>
      <pre className="terminal-body">
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
    <code className={`terminal-line kind-${line.kind}`}>
      {line.prompt ? <span className="terminal-prompt">{line.prompt} ❯</span> : null}
      <span className="terminal-text">{text}</span>
      {caret ? <span className="terminal-caret" /> : null}
    </code>
  );
}
