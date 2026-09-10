"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  isLocalizedRoutePath,
  LOCALE_CODES,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
  SITE_URL_HREF,
} from "../lib/i18n/locales";

// The open menu's own box, used to decide where it fits. min-w-32 is 128px; the height is
// the three rows plus the p-1 padding, measured in the browser at 117px. Both are only
// used to choose a side, so a few pixels either way cannot misplace the menu.
const MENU_WIDTH = 128;
const MENU_HEIGHT = 117;
const MENU_GAP = 8; // mt-2 / mb-2

export interface Placement {
  direction: "down" | "up";
  align: "start" | "end";
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Where the menu can actually be read.
//
// The switcher lives at the right edge of the public header and at the bottom-left of the
// sidebar, so no single fixed side works: in the sidebar a menu that opens downward is
// rendered past the bottom of the viewport (its `bottom-full` half is off-screen and
// unclickable), and a menu aligned to the trigger's right edge in a 87px-wide sidebar
// starts at a negative x. Deciding from the trigger's position fixes both without the
// call sites having to know where they put the switcher.
//
// Pure so it can be tested without a DOM: the sidebar and header geometries below are the
// measured ones.
export function placementFor(
  trigger: Box,
  viewport: { width: number; height: number },
  menu: { width: number; height: number } = { width: MENU_WIDTH, height: MENU_HEIGHT },
): Placement {
  const fitsBelow = trigger.bottom + MENU_GAP + menu.height <= viewport.height;
  const fitsAbove = trigger.top - MENU_GAP - menu.height >= 0;
  return {
    direction: !fitsBelow && fitsAbove ? "up" : "down",
    // Right-aligned to the trigger is the default; fall back to its left edge only when
    // that would push the menu off the left of the viewport (or when neither side fits).
    align:
      trigger.right - menu.width >= 0 || trigger.left + menu.width > viewport.width
        ? "end"
        : "start",
  };
}

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
  const [placement, setPlacement] = useState<Placement>({ direction: "down", align: "end" });
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

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const trigger = rootRef.current?.getBoundingClientRect();
    if (trigger) {
      setPlacement(placementFor(trigger, { width: window.innerWidth, height: window.innerHeight }));
    }
    setOpen(true);
  };

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
        onClick={toggle}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 font-mono text-ink-2 text-xs transition-colors hover:bg-hover hover:text-ink"
      >
        <span>{LOCALE_CODES[locale]}</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={`absolute z-50 min-w-32 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-overlay ${
            placement.direction === "up" ? "bottom-full mb-2" : "top-full mt-2"
          } ${placement.align === "start" ? "left-0" : "right-0"}`}
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
