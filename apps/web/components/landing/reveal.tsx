"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const item: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

const group: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.04 } },
};

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={item}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export function RevealGroup({
  children,
  className,
  role,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <motion.div
      className={className}
      role={role}
      variants={group}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  role,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <motion.div className={className} role={role} variants={item}>
      {children}
    </motion.div>
  );
}
