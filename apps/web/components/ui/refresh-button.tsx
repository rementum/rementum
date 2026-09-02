"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconRefresh } from "./icons";

export function RefreshButton({
  label = "Refresh",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The page is a server component that fetches with no-store, so re-running it is the
  // whole refresh; wrapping it in a transition is what makes the in-flight state observable.
  const refresh = () => startTransition(() => router.refresh());

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 font-medium text-ink-2 text-xs shadow-btn transition-all hover:bg-hover hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-60 ${className ?? ""}`}
    >
      <IconRefresh className={pending ? "animate-spin" : undefined} />
      {pending ? "Refreshing" : label}
    </button>
  );
}
