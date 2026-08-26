"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "../pui";

/** PUI Button rendered as a next/link — usable from server components (serializable props only). */
export function ButtonLink({
  href,
  variant = "glow",
  size = "md",
  sparkle,
  block,
  className,
  children,
}: {
  href: string;
  variant?: "glow" | "shimmer" | "ghost" | "solid" | "wave";
  size?: "sm" | "md" | "lg";
  sparkle?: boolean;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      as={Link}
      href={href}
      variant={variant}
      size={size}
      sparkle={sparkle}
      block={block}
      className={className}
    >
      {children}
    </Button>
  );
}
