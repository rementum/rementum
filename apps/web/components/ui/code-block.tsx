"use client";

import { isValidElement, type ReactNode } from "react";
import { CopyButton } from "./copy-button";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/** `pre` renderer with a hover copy button — for command-heavy markdown like the docs. */
export function CodeBlock({ children }: { children?: ReactNode }) {
  return (
    <div className="group relative">
      <pre>{children}</pre>
      <CopyButton
        text={textOf(children).replace(/\n$/, "")}
        className="absolute right-2 top-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
    </div>
  );
}
