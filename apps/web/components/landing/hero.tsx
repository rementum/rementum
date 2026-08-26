"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { AsciiHero, Button, EyebrowPill, GradientText, WordRoll } from "../pui";
import { AURORA_HERO, AuroraBackdrop, LazyCanvas } from "../ui/backdrop";
import { IconGitHub } from "../ui/icons";
import { GREEN_PALETTE } from "./palette";
import { TerminalDemo } from "./terminal-demo";

const HEADLINE = ["Your", "agents", "should", "remember."];

export function Hero({ githubUrl }: { githubUrl: string }) {
  return (
    <section className="relative overflow-hidden">
      <AuroraBackdrop blobs={AURORA_HERO} blur={100} intensity="bold" />
      <LazyCanvas className="absolute inset-0">
        <AsciiHero
          variant="bare"
          palette={GREEN_PALETTE}
          baseOpacity={0.1}
          spotlightOpacity={0.5}
          spotlightRadius={9}
          fontSize={11}
          style={{ position: "absolute", inset: 0 }}
        />
      </LazyCanvas>
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pb-24 pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:pb-32 lg:pt-28">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.05 }}
          >
            <EyebrowPill statusColor="var(--grad-mid)">
              Open source memory infrastructure
            </EyebrowPill>
          </motion.div>
          <h1 className="mt-5 text-display font-medium tracking-tighter text-ink">
            {HEADLINE.map((word, i) => (
              <span className="inline-block overflow-hidden pb-1 align-bottom" key={word}>
                <motion.span
                  className="mr-[0.24em] inline-block"
                  initial={{ opacity: 0, y: "0.5em", filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.7, delay: 0.15 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                >
                  {word === "remember." ? <GradientText>remember.</GradientText> : word}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            className="mt-5 max-w-xl text-lg text-ink-2 text-pretty"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.62 }}
          >
            One versioned knowledge layer for every MCP client. Rementum stages each write for
            review before it replaces shared memory.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.74 }}
          >
            <Button as={Link} href="/auth/login" variant="solid" size="lg" sparkle>
              Get started
            </Button>
            <Button as="a" href={githubUrl} variant="wave" size="lg">
              <span className="inline-flex items-center gap-2">
                <IconGitHub />
                Star on GitHub
              </span>
            </Button>
          </motion.div>
          <motion.p
            className="mt-8 flex items-center gap-2 font-mono text-2xs text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.9 }}
          >
            Works with
            <WordRoll
              words={["Claude Code", "Codex", "OpenCode"]}
              intervalMs={2400}
              gradient
              className="font-semibold"
            />
          </motion.p>
        </div>
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 28, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            aria-hidden="true"
            className="absolute -inset-[12%] bg-[radial-gradient(closest-side,rgb(47_138_112/30%),transparent)] blur-2xl"
          />
          <div className="relative overflow-hidden rounded-window border border-line-strong/60 bg-surface/70 shadow-raised backdrop-blur-xl">
            <TerminalDemo />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
