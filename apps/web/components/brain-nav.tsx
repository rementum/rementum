import Link from "next/link";

export function BrainNav({ brainId }: { brainId: string }) {
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
        <Link href={href} key={label}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
