"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Brains", href: "/", glyph: "B" },
  { label: "Connections", href: "/connections", glyph: "C" },
  { label: "API reference", href: "/docs", glyph: "A", external: true },
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/brains/");
  return pathname.startsWith(href);
}

function NavigationLinks({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={compact ? "mobile-nav-links" : "sidebar-nav"} aria-label="Workspace">
      {!compact ? <span className="nav-label">Workspace</span> : null}
      {items.map((item) => {
        const current = isCurrent(pathname, item.href);
        const content = (
          <>
            <span className="nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span>{item.label}</span>
          </>
        );
        return "external" in item ? (
          <a href={item.href} key={item.href}>
            {content}
          </a>
        ) : (
          <Link
            href={item.href}
            key={item.href}
            className={current ? "is-current" : undefined}
            aria-current={current ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNavigation() {
  return (
    <>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>Owl Memory</span>
        </Link>
        <NavigationLinks />
        <div className="sidebar-footer">
          <p>
            <span>Local workspace</span>
            Durable memory for every agent.
          </p>
          <form action="/auth/logout" method="post">
            <button className="signout-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <header className="mobile-topbar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>Owl Memory</span>
        </Link>
        <details className="mobile-menu">
          <summary>Menu</summary>
          <div className="mobile-menu-panel">
            <NavigationLinks compact />
            <form action="/auth/logout" method="post">
              <button className="signout-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </details>
      </header>
    </>
  );
}
