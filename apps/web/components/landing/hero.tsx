"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { TerminalDemo } from "./terminal-demo";

const HEADLINE = ["Your", "agents", "should", "remember."];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const auroraX = useTransform(sx, [-1, 1], ["-6%", "6%"]);
  const auroraY = useTransform(sy, [-1, 1], ["-6%", "6%"]);
  const gridX = useTransform(sx, [-1, 1], ["2.5%", "-2.5%"]);
  const gridY = useTransform(sy, [-1, 1], ["2.5%", "-2.5%"]);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      mx.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
      my.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  return (
    <section className="hero" ref={ref}>
      <motion.div className="hero-aurora" style={{ x: auroraX, y: auroraY }} aria-hidden="true" />
      <motion.div className="hero-grid" style={{ x: gridX, y: gridY }} aria-hidden="true" />
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-inner">
        <motion.span
          className="hero-badge"
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.05 }}
        >
          <span className="hero-badge-dot" />
          Self-hosted · AGPL · MCP-native
        </motion.span>
        <h1 className="hero-title">
          {HEADLINE.map((word, i) => (
            <span className="hero-word-wrap" key={word}>
              <motion.span
                className={word === "remember." ? "hero-word hero-word-accent" : "hero-word"}
                initial={{ opacity: 0, y: "0.5em", filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          className="hero-sub"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.62 }}
        >
          One versioned knowledge layer for Codex, Claude Code, OpenCode, and any MCP client. Read a
          compact index, load current canon, and propose changes that never silently overwrite your
          agents' memory.
        </motion.p>
        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.74 }}
        >
          <MagneticButton href="/auth/login">Sign in</MagneticButton>
          <a className="text-link" href="#workflow">
            See how it works
          </a>
        </motion.div>
        <motion.div
          className="hero-clients"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.92 }}
        >
          <span className="hero-clients-label">Works with</span>
          <span className="hero-client">Codex</span>
          <span className="hero-client">Claude Code</span>
          <span className="hero-client">OpenCode</span>
          <span className="hero-client">any MCP client</span>
        </motion.div>
      </div>
      <motion.div
        className="hero-panel"
        initial={{ opacity: 0, y: 28, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="hero-panel-glow" aria-hidden="true" />
        <TerminalDemo />
      </motion.div>
    </section>
  );
}

function MagneticButton({ href, children }: { href: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18 });
  const sy = useSpring(y, { stiffness: 250, damping: 18 });

  function onMove(event: React.MouseEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((event.clientX - (rect.left + rect.width / 2)) * 0.3);
    y.set((event.clientY - (rect.top + rect.height / 2)) * 0.3);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.a
      ref={ref}
      href={href}
      className="button magnetic"
      style={{ x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <span className="magnetic-shine" aria-hidden="true" />
      <span className="magnetic-label">{children}</span>
    </motion.a>
  );
}
