export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="brand-mark-body"
        d="M6 4h11.2C23.8 4 28 7.8 28 13.4s-4.2 9.4-10.8 9.4H12V28H6V4Zm6 5.2v8.4h5.2c3.1 0 4.8-1.5 4.8-4.2s-1.7-4.2-4.8-4.2H12Z"
      />
      <path className="brand-mark-accent" d="M14.2 20.6h5.7L28 28h-6.5l-7.3-7.4Z" />
    </svg>
  );
}
