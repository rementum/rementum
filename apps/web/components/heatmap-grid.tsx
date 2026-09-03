"use client";

import { type PointerEvent, useState } from "react";
import { type HeatmapCell, heatLevels } from "../lib/analytics";

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
}: {
  cells: HeatmapCell[];
  columnTemplate: string;
}) {
  const [tooltip, setTooltip] = useState<{
    label: string;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);

  function showTooltip(event: PointerEvent<HTMLElement>) {
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
    // Keep the roughly 220px-wide tooltip inside the viewport near edge cells.
    const x = Math.min(Math.max(centre, 110), window.innerWidth - 110);
    // Above the square by default, below it once the grid is scrolled far enough up that
    // the tooltip's own height would land off the top of the viewport.
    const below = rect.top < 40;
    setTooltip({ label, x, y: below ? rect.bottom : rect.top, below });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  return (
    // Leave, not out: pointerout fires on the old cell before pointerover fires on the new one,
    // so hiding there would blank the tooltip on every square crossed while sweeping the grid.
    <div
      className="grid grid-flow-col grid-rows-7 gap-1"
      onPointerLeave={hideTooltip}
      onPointerOver={showTooltip}
      style={{ gridTemplateColumns: columnTemplate }}
    >
      {cells.map((cell) => {
        if (!cell.date) return <span aria-hidden="true" className="h-3" key={cell.key} />;
        const label = cell.tracked
          ? `${utcDate(cell.date)}: ${cell.calls.toLocaleString("en")} successful MCP ${cell.calls === 1 ? "call" : "calls"}`
          : `${utcDate(cell.date)}: not tracked`;
        return (
          <span
            aria-label={label}
            className={`h-3 rounded-[2px] ring-1 ring-black/[0.04] ring-inset ${
              cell.tracked ? heatLevels[cell.level] : "bg-transparent"
            }`}
            data-label={label}
            key={cell.date}
            role="img"
            style={
              cell.tracked
                ? undefined
                : {
                    backgroundImage:
                      "repeating-linear-gradient(135deg, transparent, transparent 2px, var(--line) 2px, var(--line) 3px)",
                  }
            }
          />
        );
      })}
      {tooltip ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none fixed z-50 -translate-x-1/2 whitespace-nowrap rounded-control border border-line bg-surface px-2 py-1 text-2xs text-ink shadow-overlay ${
            tooltip.below ? "mt-1" : "-mt-1 -translate-y-full"
          }`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.label}
        </span>
      ) : null}
    </div>
  );
}
