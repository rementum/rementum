export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 164 164"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="brand-mark-tile" width="164" height="164" rx="32" />
      <path className="brand-mark-accent" d="M66 96h19l43 47h-24L66 96Z" />
      <path
        className="brand-mark-body"
        d="M24 18h61c23 0 38 15 38 39s-15 39-38 39H42V80H85c13 0 21-9 21-23s-8-23-21-23H24V18Z"
      />
      <path className="brand-mark-body" d="M24 51h18v91H24V51Z" />
    </svg>
  );
}
