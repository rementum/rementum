"use client";

import { useEffect, useRef } from "react";
import { IconMoon, IconSun } from "./icons";

export function ThemeToggle({
  className,
  label = "Toggle theme",
}: {
  className?: string;
  label?: string;
}) {
  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      delete document.documentElement.dataset.themeSwitching;
    },
    [],
  );
  const toggle = () => {
    const root = document.documentElement;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    root.dataset.themeSwitching = "true";
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    root.dataset.theme = dark ? "dark" : "light";
    document.cookie = `rementum_theme=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
    // Commit the new colors with transitions disabled before restoring interaction feedback.
    void root.offsetHeight;
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        delete root.dataset.themeSwitching;
        frame.current = null;
      });
    });
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`control-button size-9 shrink-0 ${className ?? ""}`}
    >
      <IconSun className="dark:hidden" />
      <IconMoon className="hidden dark:inline" />
    </button>
  );
}
