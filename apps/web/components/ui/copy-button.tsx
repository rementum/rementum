"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "../../lib/i18n/get-dictionary";
import { IconCheck, IconCopy } from "./icons";

export function CopyButton({
  text,
  label,
  className,
  dict,
}: {
  text: string;
  label?: string;
  className?: string;
  dict?: Pick<Dictionary, "common">;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [keyboard, setKeyboard] = useState(false);
  const reduceMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current++;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const labels = {
    idle: label ?? dict?.common.copy ?? "Copy",
    copied: dict?.common.copied ?? "Copied",
    failed: dict?.common.copyFailed ?? "Copy failed",
  };
  const moving = !reduceMotion && !keyboard;
  return (
    <button
      type="button"
      onClick={async (event) => {
        setKeyboard(event.detail === 0);
        const current = ++attempt.current;
        if (timer.current) clearTimeout(timer.current);
        try {
          await navigator.clipboard.writeText(text);
          if (current !== attempt.current) return;
          setState("copied");
        } catch {
          if (current !== attempt.current) return;
          setState("failed");
        }
        timer.current = setTimeout(() => setState("idle"), 2500);
      }}
      title={
        state === "failed"
          ? (dict?.common.copyFailedNote ?? "Copy failed. Select the text manually.")
          : undefined
      }
      className={`action-link pressable min-h-9 gap-2 bg-surface px-3 py-1.5 text-xs ${state === "failed" ? "text-red" : "text-ink-2"} ${className ?? ""}`}
    >
      <span aria-hidden="true" className="relative grid size-4 shrink-0 place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={state === "copied" ? "check" : "copy"}
            className="inline-flex"
            initial={moving ? { opacity: 0, scale: 0.25, filter: "blur(4px)" } : false}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={moving ? { opacity: 0, scale: 0.25, filter: "blur(4px)" } : { opacity: 0 }}
            transition={{ type: "spring", duration: moving ? 0.3 : 0, bounce: 0 }}
          >
            {state === "copied" ? <IconCheck className="text-green" /> : <IconCopy />}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="grid" aria-live="polite">
        {Object.entries(labels).map(([key, value]) => (
          <span
            key={key}
            aria-hidden={key !== state}
            className={`[grid-area:1/1] ${key === state ? "visible" : "invisible"}`}
          >
            {value}
          </span>
        ))}
      </span>
    </button>
  );
}
