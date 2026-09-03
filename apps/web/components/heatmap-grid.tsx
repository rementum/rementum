"use client";

import Link from "next/link";
import {
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { type AnalyticsRange, type HeatmapCell, heatLevels } from "../lib/analytics";

const utcDateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function utcDate(value: string) {
  return utcDateFormat.format(new Date(`${value}T00:00:00.000Z`));
}

export function HeatmapGrid({
  cells,
  columnTemplate,
  basePath = "/activity",
  range = "30d",
  selectedDay = null,
}: {
  cells: HeatmapCell[];
  columnTemplate: string;
  basePath?: string;
  range?: AnalyticsRange;
  selectedDay?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const firstTrackedDate = cells.find((cell) => cell.date && cell.tracked)?.date ?? null;
  const lastTrackedDate = cells.findLast((cell) => cell.date && cell.tracked)?.date ?? null;
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [syncedDay, setSyncedDay] = useState(selectedDay);
  // Picking a day navigates without remounting, so state survives it. Drop the arrowed-to
  // square on a new selection, or the tab stop drifts away from the square wearing the ring.
  if (syncedDay !== selectedDay) {
    setSyncedDay(selectedDay);
    setFocusDate(null);
  }
  const candidate = focusDate ?? selectedDay ?? lastTrackedDate;
  const activeFocusDate = cells.some((cell) => cell.date === candidate && cell.tracked)
    ? candidate
    : firstTrackedDate;
  const [tooltip, setTooltip] = useState<{
    label: string;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!tooltip) return;

    function hide() {
      setTooltip(null);
    }

    function onPointerDown(event: PointerEvent) {
      if ((event.target as HTMLElement | null)?.closest("[data-label]")) return;
      hide();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") hide();
    }

    // Dismiss on scroll so the tooltip doesn't stay fixed in the viewport while the grid moves.
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);

    // Keep tooltip within viewport bounds if its measured width overflows near edge cells.
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const padding = 8;
      if (rect.left < padding) {
        tooltipRef.current.style.left = `${padding + rect.width / 2}px`;
      } else if (rect.right > window.innerWidth - padding) {
        tooltipRef.current.style.left = `${Math.max(
          padding + rect.width / 2,
          window.innerWidth - padding - rect.width / 2,
        )}px`;
      }
    }

    return () => {
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [tooltip]);

  function showTooltip(event: ReactPointerEvent<HTMLElement> | FocusEvent<HTMLElement>) {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-label]");
    if (!cell) {
      // The container itself is the gaps between squares, and holding the tooltip open
      // across those is what stops it flickering as the pointer sweeps the grid. A padding
      // cell is a real element carrying no label, so that one does clear it.
      if (event.target !== event.currentTarget) setTooltip(null);
      return;
    }
    const label = cell.dataset.label;
    if (!label) return;
    const rect = cell.getBoundingClientRect();
    const centre = rect.left + rect.width / 2;
    // Initial center position clamped to keep ~260px tooltip inside the viewport near edge cells.
    const x = Math.min(Math.max(centre, 130), Math.max(130, window.innerWidth - 130));
    // Above the square by default, below it once the grid is scrolled far enough up that
    // the tooltip's own height would land off the top of the viewport.
    const below = rect.top < 40;
    setTooltip({ label, x, y: below ? rect.bottom : rect.top, below });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const offset = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
    }[event.key];
    if (offset === undefined) return;
    const currentDate = (event.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset
      .date;
    if (!currentDate) return;
    const currentIndex = cells.findIndex((cell) => cell.date === currentDate);
    if (currentIndex < 0) return;
    // Out of range yields undefined, so the edges of the grid stop rather than wrapping or
    // clamping onto some unrelated day.
    const target = cells[currentIndex + offset];
    if (!target?.date || !target.tracked) return;
    event.preventDefault();
    setFocusDate(target.date);
    container.current?.querySelector<HTMLElement>(`[data-date="${target.date}"]`)?.focus();
  }

  return (
    // Leave, not out: pointerout fires on the old cell before pointerover fires on the new one,
    // so hiding there would blank the tooltip on every square crossed while sweeping the grid.
    // biome-ignore lint/a11y/noStaticElementInteractions: Delegated focus and key handlers manage the heatmap links.
    <div
      className="grid grid-flow-col grid-rows-7 gap-1"
      onBlur={hideTooltip}
      onFocus={showTooltip}
      onKeyDown={moveFocus}
      onPointerLeave={hideTooltip}
      onPointerOver={showTooltip}
      ref={container}
      style={{ gridTemplateColumns: columnTemplate }}
    >
      {cells.map((cell) => {
        if (!cell.date) return <span aria-hidden="true" className="h-3" key={cell.key} />;
        const label = cell.tracked
          ? `${utcDate(cell.date)}: ${cell.calls.toLocaleString("en")} successful MCP ${cell.calls === 1 ? "call" : "calls"}`
          : `${utcDate(cell.date)}: not tracked`;
        const selected = cell.date === selectedDay;
        // A pre-tracking day reads as an empty outlined box: no fill that could be mistaken
        // for usage, and a stronger border than the filled squares' hairline so it still
        // reads as a box rather than a hole in the grid.
        const ring = selected
          ? "ring-2 ring-ink"
          : cell.tracked
            ? "ring-1 ring-black/[0.04] ring-inset"
            : "ring-1 ring-line ring-inset";
        const className = `h-3 rounded-[2px] ${ring} ${
          cell.tracked ? heatLevels[cell.level] : "bg-transparent"
        }`;
        if (!cell.tracked) {
          return (
            <span
              aria-label={label}
              className={className}
              data-date={cell.date}
              data-label={label}
              key={cell.date}
              role="img"
            />
          );
        }
        return (
          // Hundreds of links to this dynamic route would otherwise prefetch at once.
          <Link
            aria-current={selected ? "true" : undefined}
            aria-label={label}
            className={`${className} focus-visible:outline-2 focus-visible:outline-green focus-visible:outline-offset-1`}
            data-date={cell.date}
            data-label={label}
            href={
              selected
                ? `${basePath}?range=${range}`
                : `${basePath}?range=${range}&day=${cell.date}`
            }
            key={cell.date}
            prefetch={false}
            tabIndex={cell.date === activeFocusDate ? 0 : -1}
          />
        );
      })}
      {tooltip ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none fixed z-50 max-w-[calc(100vw-16px)] -translate-x-1/2 truncate whitespace-nowrap rounded-control border border-line bg-surface px-2 py-1 text-2xs text-ink shadow-overlay ${
            tooltip.below ? "mt-1" : "-mt-1 -translate-y-full"
          }`}
          ref={tooltipRef}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.label}
        </span>
      ) : null}
    </div>
  );
}
