"use client";

import Link from "next/link";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { DOCS_URL } from "../lib/site";
import { BrandMark } from "./brand";
import { LocaleSwitcher } from "./locale-switcher";
import { Button } from "./pui";
import { ThemeToggle } from "./ui/theme-toggle";

export function PublicNav({
  signupEnabled,
  signedIn,
  locale,
  dict,
}: {
  signupEnabled: boolean;
  signedIn: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const LINKS = [
    { href: "/#how-it-works", label: dict.publicNav.howItWorks },
    { href: "/#pricing", label: dict.publicNav.pricing },
    { href: "/#connect", label: dict.publicNav.connect },
    { href: DOCS_URL, label: dict.common.docs },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-surface/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
        <Link
          className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink"
          href="/"
        >
          <BrandMark className="h-6 w-6" />
          <span>Rementum</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-5 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-mono text-2xs uppercase tracking-[0.08em] text-ink-3 transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>
        {/* Full-page links, not next/link, either way. The landing routes are cached, and a
            soft navigation would keep the fetched shell in place; a document load asks the
            server again, so a visitor who signed in in another tab lands on the sidebar
            rather than this header. */}
        <div className="flex items-center gap-2 md:ml-4 max-md:ml-auto">
          <LocaleSwitcher locale={locale} label={dict.common.language} />
          <ThemeToggle />
          {/* This shell is what a signed-in visitor sees on the marketing routes, so the
              account buttons become a way back into the app instead of a sign-in pitch. */}
          {signedIn ? (
            <Button as="a" href="/dashboard" variant="solid" size="sm">
              {dict.common.dashboard}
            </Button>
          ) : (
            <>
              <Button as="a" href="/auth/login" variant="ghost" size="sm">
                {dict.common.signIn}
              </Button>
              {signupEnabled ? (
                <Button as="a" href="/register" variant="solid" size="sm">
                  {dict.common.createAccount}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
