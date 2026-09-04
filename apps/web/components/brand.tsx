import { useId } from "react";
import { BRAND_LAYERS_PATH, BRAND_LETTER_PATH } from "./brand-paths";

// The Rementum mark: an R letterform (currentColor, so it inherits the surrounding ink and themes
// with light/dark) resting on the teal "memory layers". Traced from the brand artwork; the layer
// gradient is theme-invariant. The gradient id is per-instance so several marks can share a page.
export function BrandMark({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 718 617"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="120"
          y1="150"
          x2="470"
          y2="600"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#5cc0a8" />
          <stop offset="1" stopColor="#2e7d64" />
        </linearGradient>
      </defs>
      <path d={BRAND_LAYERS_PATH} fill={`url(#${gradientId})`} />
      <path d={BRAND_LETTER_PATH} fill="currentColor" />
    </svg>
  );
}
