import Link from "next/link";
import { BrandMark } from "../components/brand";
import { Dashboard } from "../components/dashboard";
import { BentoCard } from "../components/landing/bento-card";
import { Hero } from "../components/landing/hero";
import { Marquee } from "../components/landing/marquee";
import { MotionProvider } from "../components/landing/motion-provider";
import { Reveal, RevealGroup, RevealItem } from "../components/landing/reveal";
import { ScrollProgress } from "../components/landing/scroll-progress";
import { Stepper } from "../components/landing/stepper";
import { hasSession } from "../lib/api";

export default async function Home() {
  if (!(await hasSession())) return <Landing />;
  return <Dashboard />;
}

function Landing() {
  return (
    <main className="landing-page">
      <MotionProvider>
        <ScrollProgress />
        <Hero />
        <Marquee
          items={[
            "MCP-native",
            "OAuth per agent",
            "pgvector search",
            "AI summaries",
            "versioned canon",
            "audit trail",
            "Markdown export",
            "conflict-safe writes",
            "self-hosted",
            "AGPL-3.0",
          ]}
        />
        <WorkflowLanding />
        <ControlBento />
        <ArchitectureSection />
        <CTASection />
        <footer className="landing-foot">
          <BrandMark className="brand-mark foot-mark" />
          <span>Rementum</span>
          <span className="foot-sep" aria-hidden="true">
            ·
          </span>
          <span>Open source under AGPL-3.0</span>
        </footer>
      </MotionProvider>
    </main>
  );
}

function WorkflowLanding() {
  const steps = [
    {
      code: "route",
      title: "Find the right article.",
      body: "Agents read a compact index of titles, summaries, keywords, and freshness to choose one article.",
    },
    {
      code: "read",
      title: "Load current canon.",
      body: "The full article is opened only after the index identifies it. The rest of the brain stays untouched.",
    },
    {
      code: "stage",
      title: "Analyze and stage the memory.",
      body: "Rementum sends the draft to your configured AI provider, creates a compact summary, and checks for conflicts before it touches canon.",
    },
    {
      code: "promote",
      title: "Keep the history.",
      body: "Rementum creates an immutable version and records an audit event when a write is promoted.",
    },
  ];

  return (
    <section className="landing-section workflow-landing" id="workflow" tabIndex={-1}>
      <div className="section-head">
        <Reveal>
          <h2>Load the right context.</h2>
          <p>
            Agents read a compact index, open the relevant article, and leave the rest of the brain
            untouched. Every change is staged before it lands.
          </p>
        </Reveal>
      </div>
      <Stepper steps={steps} />
    </section>
  );
}

function ControlBento() {
  return (
    <section className="landing-section control-bento">
      <div className="section-head">
        <Reveal>
          <span className="kicker">Change safely</span>
          <h2>Change knowledge without silent overwrites.</h2>
          <p>
            Rementum separates proposals from canon. You review conflicts before a write replaces
            the current version.
          </p>
        </Reveal>
      </div>
      <RevealGroup className="bento-grid">
        <BentoCard
          title="Versioned canon"
          body="Readers see one current article. Older versions remain available for recovery."
          visual={
            <div className="visual-versions" aria-hidden="true">
              <span className="vv-row vv-old">v2</span>
              <span className="vv-row vv-cur">v3 · current</span>
            </div>
          }
        />
        <BentoCard
          title="Conflict checks"
          body="A proposal is parked when its base version no longer matches the live canon."
          visual={
            <div className="visual-conflict" aria-hidden="true">
              <span className="vc-line vc-base">base v2</span>
              <span className="vc-line vc-live">live v3</span>
              <span className="vc-badge">parked</span>
            </div>
          }
        />
        <BentoCard
          title="Portable source"
          body="Export brains as Markdown and keep storage under your control."
          visual={
            <div className="visual-export" aria-hidden="true">
              <span className="ve-file">brain.md</span>
              <span className="ve-arrow">→</span>
              <span className="ve-target">yours</span>
            </div>
          }
        />
      </RevealGroup>
    </section>
  );
}

function ArchitectureSection() {
  const nodes = [
    ["Clients", "Codex, Claude Code, OpenCode"],
    ["Gateway", "Caddy, OAuth, MCP"],
    ["Application", "Fastify, Next.js, AI summaries"],
    ["Storage", "PostgreSQL, pgvector, Markdown"],
  ] as const;

  return (
    <section className="landing-section arch-landing">
      <div className="section-head">
        <Reveal>
          <h2>Run it on your own stack.</h2>
          <p>
            You control OAuth, MCP, search, embeddings, and storage. Rementum sends staged memory to
            the OpenAI-compatible AI provider you configure.
          </p>
        </Reveal>
      </div>
      <RevealGroup className="arch-path" role="list">
        {nodes.map(([title, body]) => (
          <RevealItem key={title} className="arch-node" role="listitem">
            <span className="arch-label">{title}</span>
            <strong>{body}</strong>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

function CTASection() {
  return (
    <section className="landing-section cta-landing">
      <Reveal>
        <div className="cta-card">
          <div>
            <h2>Connect an agent.</h2>
            <p>Use OAuth to grant each client its own revocable access to a shared brain.</p>
          </div>
          <div className="cta-actions">
            <Link className="button" href="/auth/login">
              Sign in
            </Link>
            <a className="button secondary" href="/docs">
              API reference
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
