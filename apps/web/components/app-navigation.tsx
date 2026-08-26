"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Team, Workspace } from "../lib/api";
import { BrandMark } from "./brand";

const items = [
  { label: "Brains", href: "/", glyph: "B" },
  { label: "Teams", href: "/teams", glyph: "T" },
  { label: "Connections", href: "/connections", glyph: "C" },
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
        return (
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

function WorkspacePicker({
  teams,
  workspaces,
  activeWorkspaceId,
}: {
  teams: Team[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}) {
  if (!workspaces.length) return null;
  return (
    <form className="team-picker" action="/workspaces/select" method="post">
      <label htmlFor="workspace-picker">Active workspace</label>
      <select
        id="workspace-picker"
        name="workspaceId"
        defaultValue={activeWorkspaceId ?? workspaces[0]?.id}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {teams.map((team) => (
          <optgroup label={team.name} key={team.id}>
            {workspaces
              .filter((workspace) => workspace.teamId === team.id)
              .map((workspace) => (
                <option value={workspace.id} key={workspace.id}>
                  {workspace.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </form>
  );
}

export function AppNavigation({
  teams,
  workspaces,
  activeWorkspaceId,
}: {
  teams: Team[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}) {
  return (
    <>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <BrandMark className="brand-mark" />
          <span>Rementum</span>
        </Link>
        <WorkspacePicker
          teams={teams}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
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
          <BrandMark className="brand-mark" />
          <span>Rementum</span>
        </Link>
        <details className="mobile-menu">
          <summary>Menu</summary>
          <div className="mobile-menu-panel">
            <WorkspacePicker
              teams={teams}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
            />
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
