"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  isLocalizedRoutePath,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
  SITE_URL_HREF,
} from "../lib/i18n/locales";

// Cookie-backed locale switcher shared by PublicNav and AppNavigation.
// Where the target is a real navigation (the landing page exists at /, /zh, and /tr) it
// goes to that URL; everywhere else it reloads in place so the server components re-read
// the cookie. Deciding by path rather than by which nav rendered this keeps the app from
// bouncing a dashboard visitor to the marketing homepage.
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
  const pathname = usePathname();

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
    // A document load, not a soft navigation, either way: every localized string is
    // rendered by a server component, so only a real request can re-render them.
    if (isLocalizedRoutePath(pathname)) {
      window.location.assign(`${SITE_URL_HREF[next] || "/"}`);
    } else {
      window.location.reload();
    }
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
