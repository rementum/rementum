"use client";

import { useRouter } from "next/navigation";

interface PrefOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export function PrefToggle({
  cookieName,
  value,
  options,
  label,
}: {
  cookieName: string;
  value: string;
  options: PrefOption[];
  label: string;
}) {
  const router = useRouter();
  const select = (next: string) => {
    if (next === value) return;
    document.cookie = `${cookieName}=${next}; path=/; max-age=31536000; samesite=lax`;
    // The server component re-reads the cookie, so the refreshed render is the
    // single source of ordering — no client-side re-sorting to drift from it.
    router.refresh();
  };

  return (
    <fieldset className="flex items-center gap-0.5 rounded-control bg-inset/60 p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          aria-label={option.icon ? option.label : undefined}
          onClick={() => select(option.value)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-chip px-2.5 font-medium text-xs  ${
            value === option.value ? "bg-surface text-ink shadow-btn" : "text-ink-3 hover:text-ink"
          }`}
        >
          {option.icon ?? option.label}
        </button>
      ))}
    </fieldset>
  );
}
