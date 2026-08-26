export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-skeleton rounded-control bg-[linear-gradient(100deg,var(--hover)_40%,var(--hover-2)_50%,var(--hover)_60%)] bg-[length:200%_100%] motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}
