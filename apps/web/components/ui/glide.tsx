"use client";

import Link from "next/link";
import { type ComponentType, type ReactNode, useLayoutEffect, useRef, useState } from "react";

export interface GlideItem {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: ReactNode;
}

/**
 * Nav list with a sliding hover highlight that rests on the active item.
 * Works vertically (sidebar) and horizontally (tab strips).
 */
export function GlideNav({
  items,
  activeIndex,
  orientation = "vertical",
  collapsed = false,
  className,
}: {
  items: GlideItem[];
  activeIndex: number;
  orientation?: "vertical" | "horizontal";
  collapsed?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [, setMeasured] = useState(false);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  // Re-render once after mount so the highlight can read element geometry.
  useLayoutEffect(() => setMeasured(true), []);

  const vertical = orientation === "vertical";
  const target = hover ?? activeIndex;
  const el = target >= 0 ? refs.current[target] : null;

  const highlight = el
    ? vertical
      ? { transform: `translateY(${el.offsetTop}px)`, height: el.offsetHeight, opacity: 1 }
      : {
          transform: `translateX(${el.offsetLeft}px)`,
          width: el.offsetWidth,
          height: el.offsetHeight,
          opacity: 1,
        }
    : { opacity: 0 };

  return (
    <nav
      className={`relative ${vertical ? "flex flex-col gap-px" : "flex items-center gap-px"} ${className ?? ""}`}
      onMouseLeave={() => setHover(null)}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-control bg-hover-2 transition-[transform,width,height,opacity] duration-[280ms] ease-out-expo ${vertical ? "inset-x-0" : "top-0"}`}
        style={highlight}
      />
      {items.map((item, i) => {
        const active = i === activeIndex;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={(node) => {
              refs.current[i] = node;
            }}
            onMouseEnter={() => setHover(i)}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={`relative z-10 flex h-9 items-center rounded-control text-sm transition-colors ${
              collapsed ? "justify-center px-0" : vertical ? "gap-2.5 px-2.5" : "gap-2 px-3"
            } ${active ? "font-medium text-ink" : "text-ink-2 hover:text-ink"} ${
              active && vertical
                ? "before:absolute before:inset-y-2 before:-left-2 before:w-0.5 before:rounded-full before:bg-accent"
                : ""
            }`}
          >
            {Icon ? (
              <span
                className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-accent" : ""}`}
              >
                <Icon />
              </span>
            ) : null}
            {collapsed ? null : (
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
