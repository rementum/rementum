"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** App navigation uses Next links; public-to-app transitions must use full-page anchors. */
export function ButtonLink({
  href,
  variant = "solid",
  size = "md",
  block,
  className,
  static: isStatic = false,
  children,
}: {
  href: string;
  variant?: "glow" | "shimmer" | "ghost" | "solid" | "wave";
  size?: "sm" | "md" | "lg";
  sparkle?: boolean;
  block?: boolean;
  className?: string;
  static?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`action-link ${isStatic ? "" : "pressable"} ${variant === "ghost" ? "action-link-quiet" : variant === "wave" ? "" : "action-link-primary"} ${size === "sm" ? "min-h-8 px-3 py-1 text-xs" : size === "lg" ? "min-h-11 px-5" : ""} ${block ? "w-full" : ""} ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}
