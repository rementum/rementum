export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="brand-mark-body"
        fillRule="evenodd"
        d="M14 10h22c11.2 0 18 6.2 18 16s-6.8 16-18 16h-9v12H14V10Zm13 11v10h9c3.3 0 5-1.7 5-5s-1.7-5-5-5h-9Z"
      />
      <path className="brand-mark-accent" d="M30 37h11l14 17H42L30 37Z" />
    </svg>
  );
}
