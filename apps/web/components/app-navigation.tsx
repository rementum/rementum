"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Team, Workspace } from "../lib/api";
import type { Dictionary } from "../lib/i18n/get-dictionary";
import type { Locale } from "../lib/i18n/locales";
import { DOCS_URL } from "../lib/site";
import { BrandMark } from "./brand";
import { LocaleSwitcher } from "./locale-switcher";
import { DropdownMenu } from "./ui/dropdown-menu";
import { GlideNav } from "./ui/glide";
import {
  IconActivity,
  IconBook,
  IconBrains,
  IconChevronDown,
  IconClose,
  IconConnections,
  IconMenu,
  IconShield,
  IconSidebar,
  IconSignOut,
  IconTeams,
} from "./ui/icons";
import { ThemeToggle } from "./ui/theme-toggle";

export function navItemsFor(systemOwner: boolean, dict?: Dictionary) {
  const labels = dict?.appNav;
  const NAV_ITEMS = [
    { label: labels?.brains ?? "Brains", href: "/dashboard", icon: IconBrains },
    { label: labels?.analytics ?? "Analytics", href: "/activity", icon: IconActivity },
    { label: labels?.teams ?? "Teams", href: "/teams", icon: IconTeams },
    { label: labels?.connections ?? "Connections", href: "/connections", icon: IconConnections },
  ];
  // Shown to the instance owner only. The link is a convenience; the pages and the API
  // each check the flag themselves.
  const INSTANCE_ITEM = {
    label: labels?.instance ?? "Instance",
    href: "/admin",
    icon: IconShield,
  };
  return systemOwner ? [...NAV_ITEMS, INSTANCE_ITEM] : NAV_ITEMS;
}

export function activeIndexFor(pathname: string) {
  if (pathname === "/dashboard" || pathname.startsWith("/brains/")) return 0;
  if (pathname.startsWith("/activity")) return 1;
  if (pathname.startsWith("/teams")) return 2;
  if (pathname.startsWith("/connections")) return 3;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return 4;
  return -1;
}

const iconButtonClass = "control-button size-9 shrink-0";

function WorkspacePicker({
  teams,
  workspaces,
  activeWorkspaceId,
  dict,
}: {
  teams: Team[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  dict: Dictionary;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  if (!active) return null;
  const activeTeam = teams.find((team) => team.id === active.teamId);
  return (
    <>
      <DropdownMenu
        label={dict.appNav.switchWorkspace}
        triggerClassName="flex min-h-12 w-full items-center gap-2.5 rounded-card bg-surface p-2.5 text-left shadow-btn hover:bg-hover"
        trigger={
          <>
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-control bg-accent-tint font-medium text-accent text-xs uppercase"
            >
              {active.name.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink text-sm">{active.name}</span>
              {activeTeam ? (
                <span className="mt-0.5 block truncate text-ink-3 text-xs">{activeTeam.name}</span>
              ) : null}
            </span>
            <IconChevronDown className="shrink-0 text-ink-3" />
          </>
        }
        items={teams.flatMap((team) =>
          workspaces
            .filter((workspace) => workspace.teamId === team.id)
            .map((workspace) => ({
              id: workspace.id,
              label: workspace.name,
              group: team.name,
              selected: workspace.id === active.id,
            })),
        )}
        onSelect={(id) => {
          if (id === active.id) return;
          if (inputRef.current) inputRef.current.value = id;
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action="/workspaces/select" method="post" className="hidden">
        <input ref={inputRef} type="hidden" name="workspaceId" defaultValue={active.id} />
      </form>
    </>
  );
}

// Docs are served in-stack at /docs (outside the Next router), so this is a plain anchor that
// opens the documentation site in a new tab rather than a next/link soft navigation.
function DocsLink({ dict }: { dict: Dictionary }) {
  return (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noreferrer"
      className={iconButtonClass}
      aria-label={dict.common.documentation}
      title={dict.common.documentation}
    >
      <IconBook />
    </a>
  );
}

function SignOutButton({ dict }: { dict: Dictionary }) {
  return (
    <form action="/auth/logout" method="post">
      <button
        type="submit"
        className={iconButtonClass}
        aria-label={dict.common.signOut}
        title={dict.common.signOut}
      >
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
  systemOwner = false,
  locale,
  dict,
}: {
  teams: Team[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  initialCollapsed?: boolean;
  systemOwner?: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = mobileDialog.current;
    if (!mobileOpen || !dialog) return;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("resize", onResize);
      dialog.close();
      menuTrigger.current?.focus();
    };
  }, [mobileOpen]);
  const navItems = navItemsFor(systemOwner, dict);
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
        className={`sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-line border-r bg-canvas md:flex ${
          collapsed ? "w-[52px]" : "w-[224px]"
        }`}
      >
        <div className={`flex items-center pt-5 pb-4 ${collapsed ? "justify-center" : "px-4"}`}>
          <Link
            href="/dashboard"
            aria-label="Rementum"
            className="brand-link flex items-center gap-2.5 font-semibold text-ink text-sm tracking-tight"
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
              title={dict.appNav.expandToSwitch}
              aria-label={dict.appNav.expandToSwitch}
              className="control-button mx-auto mb-4 size-9 bg-accent-tint font-medium font-mono text-accent text-xs uppercase"
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
              dict={dict}
            />
          </div>
        )}
        <GlideNav
          items={navItems}
          activeIndex={activeIndex}
          collapsed={collapsed}
          className={collapsed ? "px-1.5" : "px-2"}
          ariaLabel={dict.appNav.workspace}
        />
        <div
          className={`mt-auto flex flex-wrap items-center gap-0 border-line border-t py-2.5 ${
            collapsed ? "flex-col px-1.5" : "px-2"
          }`}
        >
          <LocaleSwitcher locale={locale} label={dict.common.language} compact={collapsed} />
          <ThemeToggle label={dict.common.toggleTheme} />
          <DocsLink dict={dict} />
          <button
            type="button"
            onClick={toggleCollapsed}
            className={iconButtonClass}
            aria-label={collapsed ? dict.appNav.expandSidebar : dict.appNav.collapseSidebar}
            title={collapsed ? dict.appNav.expandSidebar : dict.appNav.collapseSidebar}
          >
            <IconSidebar />
          </button>
          <div className={collapsed ? "" : "ml-auto"}>
            <SignOutButton dict={dict} />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-line border-b bg-canvas px-4 md:hidden">
        <Link
          href="/dashboard"
          aria-label="Rementum"
          className="brand-link flex items-center gap-2.5 font-semibold text-ink text-sm tracking-tight"
        >
          <BrandMark className="size-7" />
          <span>Rementum</span>
        </Link>
        <button
          type="button"
          ref={menuTrigger}
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
          onClick={(event) => {
            setKeyboardOpen(event.detail === 0);
            setMobileOpen(true);
          }}
          className={iconButtonClass}
          aria-label={dict.appNav.openMenu}
        >
          <IconMenu />
        </button>
      </header>

      <dialog
        ref={mobileDialog}
        aria-label={dict.appNav.workspace}
        data-keyboard={keyboardOpen}
        className="mobile-drawer"
        onCancel={() => setMobileOpen(false)}
        onClose={() => setMobileOpen(false)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            setMobileOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setMobileOpen(false);
        }}
      >
        <div className="flex min-h-dvh flex-col gap-6 p-5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink text-sm">{dict.appNav.workspace}</span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className={iconButtonClass}
              aria-label={dict.appNav.closeMenu}
            >
              <IconClose />
            </button>
          </div>
          <WorkspacePicker
            teams={teams}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            dict={dict}
          />
          <GlideNav items={navItems} activeIndex={activeIndex} ariaLabel={dict.appNav.workspace} />
          <div className="mt-auto flex items-center justify-between border-line border-t pt-4">
            <div className="flex items-center gap-1">
              <LocaleSwitcher locale={locale} label={dict.common.language} />
              <ThemeToggle label={dict.common.toggleTheme} />
              <DocsLink dict={dict} />
            </div>
            <SignOutButton dict={dict} />
          </div>
        </div>
      </dialog>
    </>
  );
}
