"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

export interface GlideItem {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: ReactNode;
}

export function GlideNav({
  items,
  activeIndex,
  orientation = "vertical",
  collapsed = false,
  className,
  ariaLabel,
}: {
  items: GlideItem[];
  activeIndex: number;
  orientation?: "vertical" | "horizontal";
  collapsed?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`flex gap-1 ${orientation === "vertical" ? "flex-col" : "items-center"} ${className ?? ""}`}
    >
      {items.map((item, index) => {
        const active = index === activeIndex;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={`flex min-h-11 items-center gap-2.5 rounded-control px-3 text-sm ${collapsed ? "justify-center px-0" : ""} ${active ? "bg-accent-tint font-medium text-accent" : "text-ink-2 hover:bg-hover hover:text-ink"}`}
          >
            {Icon ? <Icon className="shrink-0" /> : null}
            {collapsed ? (
              <span className="sr-only">{item.label}</span>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge}
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
