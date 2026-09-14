"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { observePageActivity } from "../../lib/page-activity";
import { Aurora } from "../pui";

/** Shared Mineral-green blob sets for Aurora backdrops. Positions/sizes are 0–100 units. */
export const AURORA_HERO = [
  { color: "rgb(47 111 94 / 55%)", x: 16, y: 28, size: 56 },
  { color: "rgb(52 211 153 / 38%)", x: 80, y: 18, size: 46 },
  { color: "rgb(45 212 191 / 30%)", x: 52, y: 78, size: 52 },
];

export const AURORA_SOFT = [
  { color: "rgb(47 111 94 / 34%)", x: 20, y: 25, size: 52 },
  { color: "rgb(52 211 153 / 22%)", x: 78, y: 30, size: 44 },
  { color: "rgb(121 170 152 / 18%)", x: 50, y: 80, size: 50 },
];

/**
 * Mounts canvas/animation children only while the page is active and near the viewport, and not under
 * prefers-reduced-motion. Keeps rAF loops from running for off-screen sections.
 */
export function LazyCanvas({
  children,
  className,
  margin = "600px",
}: {
  children: ReactNode;
  className?: string;
  margin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    let active = false;
    const sync = () => setShow(inView && active && !reducedMotion.matches);
    const stopObservingActivity = observePageActivity((value) => {
      active = value;
      sync();
    });
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
        sync();
      },
      { rootMargin: margin },
    );
    io.observe(el);
    reducedMotion.addEventListener("change", sync);
    return () => {
      io.disconnect();
      stopObservingActivity();
      reducedMotion.removeEventListener("change", sync);
    };
  }, [margin]);

  return (
    <div ref={ref} aria-hidden="true" className={className}>
      {show ? children : null}
    </div>
  );
}

/**
 * Aurora wash pinned behind a `relative` parent. Blob colors stay theme-agnostic; the
 * light theme dims them via wrapper opacity — "bold" keeps light mode saturated instead.
 */
export function AuroraBackdrop({
  blobs = AURORA_SOFT,
  animated = false,
  blur = 90,
  intensity = "soft",
  className,
}: {
  blobs?: typeof AURORA_SOFT;
  animated?: boolean;
  blur?: number;
  intensity?: "soft" | "bold";
  className?: string;
}) {
  const light =
    intensity === "bold"
      ? "opacity-90 saturate-150 dark:opacity-100 dark:saturate-100"
      : "opacity-50 dark:opacity-100";
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${light} ${className ?? ""}`}
    >
      {/* `animated=false` selects CSS drift in performative-ui; only `static` disables it. */}
      <Aurora blobs={blobs} animated={animated} static={!animated} blur={blur} />
    </div>
  );
}
