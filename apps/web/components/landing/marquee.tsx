"use client";

import { motion } from "motion/react";

export function Marquee({ items }: { items: string[] }) {
  const loop = [
    ...items.map((t, i) => ({ t, k: `a${i}` })),
    ...items.map((t, i) => ({ t, k: `b${i}` })),
  ];
  return (
    <div className="marquee" aria-hidden="true">
      <motion.div
        className="marquee-track"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 32, ease: "linear", repeat: Infinity }}
      >
        {loop.map((entry) => (
          <span className="marquee-item" key={entry.k}>
            {entry.t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
