"use client";

import { useState } from "react";
import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { IconCheck, IconCopy } from "./icons";

export function CopyButton({
  text,
  label = "Copy",
  className,
  // Optional so out-of-scope callers stay English untouched.
  dict,
}: {
  text: string;
  label?: string;
  className?: string;
  dict?: Dictionary;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const common = dict?.common;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Clipboard unavailable (permissions, insecure context) — tell the user instead of lying.
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={
        state === "failed"
          ? (common?.copyFailedNote ?? "Copy failed. Select the text manually.")
          : undefined
      }
      className={`inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium shadow-btn transition-all hover:bg-hover active:scale-[0.96] ${
        state === "failed" ? "text-red" : "text-ink-2 hover:text-ink"
      } ${className ?? ""}`}
    >
      {state === "copied" ? <IconCheck className="text-green" /> : <IconCopy />}
      {state === "copied"
        ? (common?.copied ?? "Copied")
        : state === "failed"
          ? (common?.copyFailed ?? "Copy failed")
          : (label ?? common?.copy ?? "Copy")}
    </button>
  );
}
