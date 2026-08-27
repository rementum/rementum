"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { Field, fieldControlClass } from "./field";

const DANGER_CONFIRM_CLASS =
  "rounded-control border border-red/25 bg-red-tint px-3 py-2 text-sm font-medium text-red transition-colors hover:border-red/40 hover:bg-red/15 disabled:pointer-events-none disabled:opacity-50";
const CANCEL_CLASS =
  "rounded-control border border-line px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50";

interface DialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  /** When set, the confirm button stays disabled until the user types this exact string. */
  expectedName?: string;
  onConfirm: (confirmation: string) => void;
  onCancel: () => void;
}

/**
 * In-page replacement for native confirm/prompt dialogs. Panel remounts on every
 * open so typed input resets and autofocus re-engages without extra state.
 */
export function ConfirmDialog({ open, ...dialog }: DialogProps & { open: boolean }) {
  return <AnimatePresence>{open ? <DialogPanel {...dialog} /> : null}</AnimatePresence>;
}

function DialogPanel({
  title,
  description,
  confirmLabel,
  busy = false,
  error = "",
  expectedName,
  onConfirm,
  onCancel,
}: DialogProps) {
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const matched = expectedName === undefined || typed === expectedName;

  // Native dialogs dismiss on Escape; keep that affordance so keyboard users can back out.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Move focus into the dialog on open: the name input when one exists, Cancel otherwise.
  useEffect(() => {
    (expectedName === undefined ? cancelRef : inputRef).current?.focus();
  }, [expectedName]);

  return (
    <div className="fixed inset-0 z-50">
      <motion.button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="w-full max-w-md rounded-card border border-line bg-surface p-4 shadow-overlay"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <p id={titleId} className="text-sm font-medium text-ink">
            {title}
          </p>
          <p id={descriptionId} className="mt-1 text-xs text-ink-2">
            {description}
          </p>
          {expectedName !== undefined ? (
            <div className="mt-3">
              <Field
                label="Confirmation"
                htmlFor={inputId}
                hint={`Type "${expectedName}" to continue.`}
              >
                <input
                  id={inputId}
                  ref={inputRef}
                  className={fieldControlClass}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </div>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-control border border-red/25 bg-red/10 px-3 py-2 text-xs text-red">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              className={CANCEL_CLASS}
              ref={cancelRef}
              type="button"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className={DANGER_CONFIRM_CLASS}
              type="button"
              disabled={busy || !matched}
              onClick={() => onConfirm(expectedName === undefined ? "" : typed)}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
