"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import { type Locale, SITE_URL_HREF } from "../lib/i18n/locales";
import { DOCS_URL } from "../lib/site";
import { BrandMark } from "./brand";
import { LocaleSwitcher } from "./locale-switcher";
import { IconClose, IconMenu } from "./ui/icons";
import { ThemeToggle } from "./ui/theme-toggle";

export function PublicNav({
  signupEnabled,
  signedIn = false,
  locale,
  dict,
}: {
  signupEnabled: boolean;
  signedIn?: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const homeHref = SITE_URL_HREF[locale] || "/";
  const LINKS = [
    { href: `${homeHref}#how-it-works`, label: dict.publicNav.howItWorks },
    { href: `${homeHref}#pricing`, label: dict.publicNav.pricing },
    { href: `${homeHref}#connect`, label: dict.publicNav.connect },
    { href: DOCS_URL, label: dict.common.docs },
  ];
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menu.current?.focus();
      }
    };
    const onOutside = (event: MouseEvent) => {
      if (header.current && !header.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [open]);

  return (
    <header ref={header} className="sticky top-0 z-50 border-line border-b bg-page">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1248px] items-center gap-3 px-5 sm:px-8">
        <Link
          className="brand-link inline-flex shrink-0 items-center gap-2.5 font-semibold text-base text-ink tracking-tight"
          aria-label="Rementum"
          href={homeHref}
        >
          <BrandMark className="size-7" />
          <span className="hidden min-[420px]:inline">Rementum</span>
        </Link>
        <nav
          aria-label={dict.publicNav.mainNavigation}
          className="ml-auto hidden items-center gap-6 lg:flex"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-ink-2 text-sm transition-colors hover:text-accent"
            >
              {link.label}
            </a>
          ))}
        </nav>
        {/* A document load restores the session-aware shell after the cached public page. */}
        <div className="ml-auto flex items-center gap-1.5 lg:ml-4">
          <LocaleSwitcher locale={locale} label={dict.common.language} />
          <ThemeToggle label={dict.common.toggleTheme} />
          <a
            href={signedIn ? "/dashboard" : "/auth/login"}
            className="action-link action-link-quiet min-h-9 px-3 py-1.5"
          >
            {signedIn ? dict.common.dashboard : dict.common.signIn}
          </a>
          {!signedIn && signupEnabled ? (
            <a
              href="/register"
              className="action-link action-link-primary hidden min-h-9 px-3 py-1.5 sm:inline-flex"
            >
              {dict.common.createAccount}
            </a>
          ) : null}
          <button
            ref={menu}
            type="button"
            className="control-button size-10 lg:hidden"
            aria-label={open ? dict.publicNav.closeNavigation : dict.publicNav.openNavigation}
            aria-expanded={open}
            aria-controls="public-mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>
      <nav
        id="public-mobile-nav"
        aria-label={dict.publicNav.mobileNavigation}
        hidden={!open}
        className="border-line border-t px-5 py-4 sm:px-8 lg:hidden"
      >
        <ul className="flex flex-col gap-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-control px-3 py-2.5 text-ink-2 text-sm hover:bg-hover"
              >
                {link.label}
              </a>
            </li>
          ))}
          {!signedIn && signupEnabled ? (
            <li className="mt-2 sm:hidden">
              <a href="/register" className="action-link action-link-primary w-full">
                {dict.common.createAccount}
              </a>
            </li>
          ) : null}
        </ul>
      </nav>
    </header>
  );
}
