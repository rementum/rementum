"use client";

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { menuPlacement } from "../../lib/menu-placement";
import { IconCheck } from "./icons";

interface MenuItem {
  id: string;
  label: string;
  group?: string;
  selected: boolean;
}

export function DropdownMenu({
  label,
  trigger,
  items,
  onSelect,
  triggerClassName = "control-button px-2.5",
}: {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  onSelect: (id: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<ReturnType<typeof menuPlacement>>();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) button.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const position = () => {
      if (!button.current || !menu.current) return;
      setPlacement(
        menuPlacement(
          button.current.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
          { width: 224, height: menu.current.scrollHeight },
        ),
      );
    };
    position();
    const selected = menu.current.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (selected ?? menu.current.querySelector<HTMLButtonElement>("button"))?.focus();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div ref={root} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          style={placement}
          className="absolute z-[70] w-56 overflow-y-auto rounded-card bg-surface p-1 shadow-overlay ring-1 ring-line"
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget)) setOpen(false);
          }}
          onKeyDown={(event) => {
            const buttons = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
            );
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            } else if (event.key === "Tab") close(true);
            else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const target =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[target]?.focus();
            }
          }}
        >
          {items.map((item, index) => (
            <div key={item.id} role="none">
              {item.group && item.group !== items[index - 1]?.group ? (
                <p className="px-3 pt-3 pb-1.5 text-ink-3 text-xs">{item.group}</p>
              ) : null}
              <button
                type="button"
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={item.selected}
                className={`flex min-h-10 w-full items-center gap-3 rounded-chip px-3 py-2 text-left text-sm hover:bg-hover focus-visible:bg-hover ${item.selected ? "font-medium text-accent" : "text-ink-2"}`}
                onClick={() => {
                  close(true);
                  onSelect(item.id);
                }}
              >
                <span className="min-w-0 flex-1 break-words">{item.label}</span>
                {item.selected ? <IconCheck className="shrink-0" /> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
