"use client";

import { IconMoon, IconSun } from "./icons";

export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    root.dataset.theme = dark ? "dark" : "light";
    document.cookie = `rementum_theme=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className={`inline-flex size-8 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-hover hover:text-ink ${className ?? ""}`}
    >
      <IconSun className="dark:hidden" />
      <IconMoon className="hidden dark:inline" />
    </button>
  );
}
