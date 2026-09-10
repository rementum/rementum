"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALE_COOKIE, LOCALE_LABELS, LOCALES, type Locale } from "../lib/i18n/locales";

// Cookie-backed locale switcher shared by PublicNav and AppNavigation.
// The homepage is served per locale at /, /zh, and /tr, so a switch there is a real
// navigation; inside the app there is no localized route yet, so it writes the cookie
// and loads the equivalent route so server components re-read it.
export function LocaleSwitcher({
  locale,
  label,
  className,
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // A document load re-renders every server component against the new cookie;
    // on the public site it also lands on that locale's own URL.
    window.location.assign(next === "en" ? "/" : `/${next}`);
  };

  return (
    <div className={`relative ${className ?? ""}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 font-mono text-ink-2 text-xs transition-colors hover:bg-hover hover:text-ink"
      >
        <span aria-hidden="true">🌐</span>
        <span>{LOCALE_LABELS[locale]}</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-50 mt-2 min-w-32 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-overlay"
        >
          {LOCALES.map((option: Locale) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === locale}
              onClick={() => select(option)}
              className={`flex w-full items-center justify-between gap-3 rounded-control px-2.5 py-2 text-left text-sm transition-colors hover:bg-hover ${
                option === locale ? "font-medium text-accent" : "text-ink-2"
              }`}
            >
              {LOCALE_LABELS[option]}
              {option === locale ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
