"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "../../lib/i18n/get-dictionary";
import type { PromoController } from "./promo/mount";

const WIDE_SCREEN = "(min-width: 48rem)";

export function PromoPlayer({ dict }: { dict: Dictionary }) {
  const promo = dict.promo;
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const controller = useRef<PromoController | null>(null);
  const visible = useRef(false);
  const wantsPlayback = useRef(playing);

  useEffect(() => {
    wantsPlayback.current = playing;
    if (playing && visible.current) controller.current?.play();
    else controller.current?.pause();
  }, [playing]);

  useEffect(() => {
    if (!open || !host.current) return;
    const element = host.current;
    const wide = window.matchMedia(WIDE_SCREEN);
    if (!wide.matches) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.2);
        if (visible.current && wantsPlayback.current) controller.current?.play();
        else controller.current?.pause();
      },
      { threshold: 0.2 },
    );
    const onResize = () => {
      if (!wide.matches) setOpen(false);
    };
    observer.observe(element);
    wide.addEventListener("change", onResize);
    // The animation measures text and starts a frame loop. Neither belongs in the initial page load.
    import("./promo/mount")
      .then(({ mountPromo }) => {
        if (cancelled) return;
        controller.current = mountPromo(element, promo);
        setReady(true);
        if (visible.current && wantsPlayback.current) controller.current.play();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      observer.disconnect();
      wide.removeEventListener("change", onResize);
      controller.current?.destroy();
      controller.current = null;
      visible.current = false;
    };
  }, [open, promo]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="mt-10 hidden md:block">
      <button
        ref={trigger}
        type="button"
        className="action-link"
        aria-expanded={open}
        aria-controls="promo-overview"
        onClick={() => {
          if (open) close();
          else {
            setReady(false);
            setFailed(false);
            setPlaying(true);
            setOpen(true);
          }
        }}
      >
        {open ? promo.closeOverview : promo.watch}
        <span className="font-mono text-ink-3 text-xs">{promo.duration}</span>
      </button>
      <div id="promo-overview" hidden={!open}>
        {open ? (
          <div className="mt-5 overflow-hidden rounded-window border border-line-strong">
            <div className="flex items-center justify-between border-line border-b bg-surface px-5 py-3">
              <p className="text-ink-2 text-sm">{promo.title}</p>
              <div className="flex gap-2">
                {ready && !failed ? (
                  <button
                    type="button"
                    className="action-link min-h-8 py-1 text-xs"
                    onClick={() => setPlaying((value) => !value)}
                  >
                    {playing ? promo.pause : promo.play}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="action-link action-link-quiet min-h-8 py-1 text-xs"
                  onClick={close}
                >
                  {dict.common.close}
                </button>
              </div>
            </div>
            <div className="relative aspect-video bg-inset">
              {!ready || failed ? (
                <p
                  role="status"
                  className="absolute inset-0 grid place-items-center p-6 text-ink-2 text-sm"
                >
                  {failed ? promo.failed : promo.loading}
                </p>
              ) : null}
              <div
                ref={host}
                role="img"
                aria-label={promo.ariaLabel}
                className="absolute inset-0 overflow-hidden"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
