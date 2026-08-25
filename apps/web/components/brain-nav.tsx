"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BrainNav({ brainId }: { brainId: string }) {
  const pathname = usePathname();
  const items = [
    ["Index", `/brains/${brainId}`],
    ["Writes", `/brains/${brainId}/writes`],
    ["Tasks", `/brains/${brainId}/tasks`],
    ["Maintenance", `/brains/${brainId}/maintenance`],
    ["Activity", `/brains/${brainId}/activity`],
    ["Import", `/brains/${brainId}/import`],
  ] as const;
  return (
    <nav className="brain-nav" aria-label="Brain management">
      {items.map(([label, href]) => (
        <Link
          href={href}
          key={label}
          className={pathname === href ? "is-current" : undefined}
          aria-current={pathname === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
