"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface Step {
  code: string;
  title: string;
  body: string;
}

export function Stepper({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLElement>(null);
  // Rail must end at the last node's center; the last row's text runs taller than
  // its node tile, so the end offset is only known after layout.
  const [railHeight, setRailHeight] = useState<number | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.55"],
  });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  useEffect(() => {
    const list = ref.current;
    const last = lastRef.current;
    if (!list || !last) return;
    const measure = () => setRailHeight(last.offsetTop);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    observer.observe(last);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative flex flex-col gap-10" ref={ref}>
      <div
        aria-hidden="true"
        className="absolute left-[19.5px] top-5 w-px overflow-hidden bg-line"
        style={railHeight == null ? { bottom: 20 } : { height: railHeight }}
      >
        <motion.div
          className="h-full w-full origin-top bg-gradient-to-b from-grad-from via-grad-mid to-grad-to"
          style={{ scaleY }}
        />
      </div>
      {steps.map((step, i) => (
        <motion.article
          className="relative flex gap-5"
          key={step.code}
          ref={i === steps.length - 1 ? lastRef : undefined}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -12% 0px" }}
          transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-control border border-line-strong/60 bg-surface/80 shadow-glow backdrop-blur-md">
            <span className="font-mono text-2xs font-semibold tabular-nums text-ink-2">
              {String(i + 1).padStart(2, "0")}
            </span>
          </div>
          <div className="max-w-xl pt-1">
            <span className="font-mono text-2xs uppercase tracking-[0.14em] text-accent">
              {step.code}
            </span>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">{step.title}</h3>
            <p className="mt-1.5 text-sm text-ink-2">{step.body}</p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
