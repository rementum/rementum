import type { ReactNode } from "react";

const TONES = {
  neutral: "border-line bg-inset text-ink-2",
  accent: "border-accent/30 bg-accent-tint text-accent",
  orange: "border-orange/30 bg-orange/10 text-orange",
  green: "border-green/25 bg-green/10 text-green",
} as const;

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-chip border px-1.5 py-0.5 font-mono text-2xs ${TONES[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
