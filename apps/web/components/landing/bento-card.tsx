"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";

export function BentoCard({
  title,
  body,
  visual,
  className,
}: {
  title: string;
  body: string;
  visual?: ReactNode;
  className?: string;
}) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const sx = useSpring(mx, { stiffness: 150, damping: 20 });
  const sy = useSpring(my, { stiffness: 150, damping: 20 });

  const background = useTransform(
    () =>
      `radial-gradient(440px circle at ${sx.get() * 100}% ${sy.get() * 100}%, rgb(47 111 94 / 18%), transparent 46%)`,
  );

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - rect.left) / rect.width);
    my.set((event.clientY - rect.top) / rect.height);
  }

  function onLeave() {
    mx.set(0.5);
    my.set(0.5);
  }

  return (
    <motion.article
      className={`bento-card ${className ?? ""}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
        },
      }}
    >
      <motion.div className="bento-spotlight" style={{ background }} aria-hidden="true" />
      <div className="bento-border" aria-hidden="true" />
      {visual ? <div className="bento-visual">{visual}</div> : null}
      <div className="bento-content">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </motion.article>
  );
}
