"use client";

import Link from "next/link";
import { BrandMark } from "./brand";
import { Button } from "./pui";
import { ThemeToggle } from "./ui/theme-toggle";

const LINKS = [
  { href: "/#workflow", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#architecture", label: "Architecture" },
  { href: "/#connect", label: "Connect" },
];

export function PublicNav({ signupEnabled }: { signupEnabled: boolean }) {
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
        <div className="flex items-center gap-2 md:ml-4 max-md:ml-auto">
          <ThemeToggle />
          <Button as={Link} href="/auth/login" variant="ghost" size="sm">
            Sign in
          </Button>
          {signupEnabled ? (
            <Button as={Link} href="/register" variant="solid" size="sm">
              Create account
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
