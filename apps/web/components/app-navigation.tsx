"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Team, Workspace } from "../lib/api";
import { DOCS_URL } from "../lib/site";
import { BrandMark } from "./brand";
import { GlideNav } from "./ui/glide";
import {
  IconActivity,
  IconBook,
  IconBrains,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconConnections,
  IconMenu,
  IconSidebar,
  IconSignOut,
  IconTeams,
} from "./ui/icons";
import { ThemeToggle } from "./ui/theme-toggle";

const NAV_ITEMS = [
  { label: "Brains", href: "/dashboard", icon: IconBrains },
  { label: "Analytics", href: "/activity", icon: IconActivity },
  { label: "Teams", href: "/teams", icon: IconTeams },
  { label: "Connections", href: "/connections", icon: IconConnections },
];

function activeIndexFor(pathname: string) {
  if (pathname === "/dashboard" || pathname.startsWith("/brains/")) return 0;
  if (pathname.startsWith("/activity")) return 1;
  if (pathname.startsWith("/teams")) return 2;
  if (pathname.startsWith("/connections")) return 3;
  return -1;
}

const iconButtonClass =
  "inline-flex size-8 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-hover hover:text-ink";

function WorkspacePicker({
  teams,
  workspaces,
  activeWorkspaceId,
}: {
  teams: Team[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  if (!workspaces.length) return null;
  const active =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeTeam = teams.find((team) => team.id === active.teamId);

  const pick = (workspaceId: string) => {
    setOpen(false);
    if (workspaceId === active.id) return;
    if (inputRef.current) inputRef.current.value = workspaceId;
    formRef.current?.requestSubmit();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Switch workspace"
        className="flex w-full items-center gap-2.5 rounded-control border border-line bg-surface px-2 py-1.5 text-left shadow-btn transition-colors hover:bg-hover"
      >
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-chip bg-gradient-to-br from-grad-from to-grad-to font-mono text-[10px] font-bold uppercase text-white"
        >
          {active.name.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{active.name}</span>
          {activeTeam ? (
            <span className="block truncate font-mono text-[10.5px] text-ink-3">
              {activeTeam.name}
            </span>
          ) : null}
        </span>
        <IconChevronDown
          className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-overlay">
          {teams.map((team) => {
            const teamWorkspaces = workspaces.filter((workspace) => workspace.teamId === team.id);
            if (!teamWorkspaces.length) return null;
            return (
              <div key={team.id} className="mb-1 last:mb-0">
                <p className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  {team.name}
                </p>
                {teamWorkspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => pick(workspace.id)}
                    className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                  >
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    {workspace.id === active.id ? (
                      <IconCheck className="shrink-0 text-accent" />
                    ) : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
      <form ref={formRef} action="/workspaces/select" method="post" className="hidden">
        <input ref={inputRef} type="hidden" name="workspaceId" defaultValue={active.id} />
      </form>
    </div>
  );
}

// Docs are served in-stack at /docs (outside the Next router), so this is a plain anchor that
// opens the documentation site in a new tab rather than a next/link soft navigation.
function DocsLink() {
  return (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noreferrer"
      className={iconButtonClass}
      aria-label="Documentation"
      title="Documentation"
    >
      <IconBook />
    </a>
  );
}

function SignOutButton() {
  return (
    <form action="/auth/logout" method="post">
      <button type="submit" className={iconButtonClass} aria-label="Sign out" title="Sign out">
        <IconSignOut />
      </button>
    </form>
  );
}

export function AppNavigation({
  teams,
  workspaces,
  activeWorkspaceId,
  initialCollapsed = false,
}: {
  teams: Team[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeIndex = activeIndexFor(pathname);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `rementum_sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <>
      <aside
        className={`sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-line bg-canvas transition-[width] duration-[280ms] ease-out-expo md:flex ${
          collapsed ? "w-[52px]" : "w-[224px]"
        }`}
      >
        <div className={`flex items-center pb-4 pt-5 ${collapsed ? "justify-center" : "px-4"}`}>
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink"
          >
            <BrandMark className="size-7 shrink-0" />
            {collapsed ? null : <span>Rementum</span>}
          </Link>
        </div>
        {collapsed ? (
          workspaces.length ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Expand sidebar to switch workspace"
              aria-label="Expand sidebar to switch workspace"
              className="mx-auto mb-4 grid size-7 place-items-center rounded-chip bg-gradient-to-br from-grad-from to-grad-to font-mono text-[10px] font-bold uppercase text-white transition-transform active:scale-[0.94]"
            >
              {(
                workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0]
              ).name.slice(0, 2)}
            </button>
          ) : null
        ) : (
          <div className="px-2 pb-4">
            <WorkspacePicker
              teams={teams}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
            />
          </div>
        )}
        <GlideNav
          items={NAV_ITEMS}
          activeIndex={activeIndex}
          collapsed={collapsed}
          className={collapsed ? "px-1.5" : "px-2"}
          ariaLabel="Workspace"
        />
        <div
          className={`mt-auto flex items-center gap-1 border-t border-line py-2.5 ${
            collapsed ? "flex-col px-1.5" : "px-2"
          }`}
        >
          <ThemeToggle />
          <DocsLink />
          <button
            type="button"
            onClick={toggleCollapsed}
            className={iconButtonClass}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconSidebar />
          </button>
          <div className={collapsed ? "" : "ml-auto"}>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur md:hidden">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink"
        >
          <BrandMark className="size-7" />
          <span>Rementum</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className={iconButtonClass}
          aria-label="Open menu"
        >
          <IconMenu />
        </button>
      </header>

      <AnimatePresence>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="absolute inset-y-0 right-0 flex w-[300px] flex-col gap-5 border-l border-line bg-canvas p-4"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xs uppercase tracking-[0.1em] text-ink-3">
                  Workspace
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className={iconButtonClass}
                  aria-label="Close menu"
                >
                  <IconClose />
                </button>
              </div>
              <WorkspacePicker
                teams={teams}
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
              />
              <GlideNav items={NAV_ITEMS} activeIndex={activeIndex} ariaLabel="Workspace" />
              <div className="mt-auto flex items-center justify-between border-t border-line pt-3">
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <DocsLink />
                </div>
                <SignOutButton />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
