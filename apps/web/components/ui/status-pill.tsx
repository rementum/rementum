type Tone = "success" | "danger" | "warn" | "progress" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  promoted: "success",
  approved: "success",
  completed: "success",
  resolved: "success",
  compacted: "success",
  current: "success",
  active: "success",
  failed: "danger",
  conflicted: "danger",
  pending: "warn",
  review: "warn",
  review_due: "warn",
  stale: "warn",
  unverified: "warn",
  queued: "progress",
  processing: "progress",
  claimed: "progress",
  open: "progress",
  disabled: "neutral",
  not_compacted: "neutral",
  cancelled: "neutral",
  withdrawn: "neutral",
  dismissed: "neutral",
  unknown: "neutral",
};

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-green/25 bg-green/10 text-green",
  danger: "border-red/30 bg-red/10 text-red",
  warn: "border-orange/30 bg-orange/10 text-orange",
  progress: "border-accent/30 bg-accent/10 text-accent",
  neutral: "border-line bg-inset text-ink-3",
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}

export function StatusPill({
  status,
  label,
  pulse,
  className,
}: {
  status: string;
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  const tone = statusTone(status);
  const dot = pulse ?? tone === "progress";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${TONE_CLASSES[tone]} ${className ?? ""}`}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 animate-pulse-dot rounded-full bg-current" />
      ) : null}
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}
