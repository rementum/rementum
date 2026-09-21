import type { ReactNode } from "react";

export function renderTerms(value: string): ReactNode {
  const parts = value.split(/\[\[([^\]]+)\]\]/g);
  if (parts.length === 1) return value;
  // English product terms need English casing even under a Turkish uppercase parent.
  return parts.map((part, index) =>
    index % 2 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: These text segments have no state or independent identity.
      <span lang="en" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
