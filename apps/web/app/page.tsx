import Link from "next/link";
import { LandingMotion } from "../components/landing-motion";
import { api, hasSession } from "../lib/api";

interface Brain {
  id: string;
  slug: string;
  name: string;
  description: string;
  updatedAt: string;
}

export default async function Home() {
  if (!(await hasSession())) return <Landing />;
  const brains = await api<Brain[]>("/api/v1/brains");
  return (
    <main className="shell">
      <section className="page-intro">
        <div>
          <p className="kicker">Knowledge workspace</p>
          <h1>Brains</h1>
          <p>Versioned knowledge shared across every connected agent.</p>
        </div>
        <div className="page-stat">
          <strong>{brains.length}</strong>
          <span>{brains.length === 1 ? "brain" : "brains"}</span>
        </div>
      </section>
      {brains.length ? (
        <div className="brain-grid">
          {brains.map((brain) => (
            <Link className="brain-cell" href={`/brains/${brain.id}`} key={brain.id}>
              <div className="brain-cell-top">
                <span className="mono">{brain.slug}</span>
                <span className="open-label">Open</span>
              </div>
              <div>
                <h2>{brain.name}</h2>
                <p>{brain.description || "No description yet."}</p>
              </div>
              <span className="cell-meta">Updated {formatDate(brain.updatedAt)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <h2>No brains yet</h2>
          <p>
            Create the first brain through the API or a connected agent, then it will appear here.
          </p>
          <a className="button secondary" href="/docs">
            Open API docs
          </a>
        </section>
      )}
      <WorkflowSection />
    </main>
  );
}

function Landing() {
  return (
    <main className="landing-page">
      <LandingMotion />
      <section className="landing">
        <div className="hero-copy">
          <p className="kicker">Self-hosted memory for AI agents</p>
          <h1>Your agents should remember.</h1>
          <p className="hero-sub">
            One versioned knowledge layer for Codex, Claude Code, and other MCP clients.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/auth/login">
              Sign in
            </Link>
            <a className="text-link" href="#workflow">
              See how it works
            </a>
          </div>
        </div>
        <aside
          className="hero-system"
          aria-label="A staged memory moving through the routing index into versioned canonical knowledge"
          role="img"
        >
          <div className="memory-field" aria-hidden="true">
            <span className="memory-orbit memory-orbit-outer" />
            <span className="memory-orbit memory-orbit-inner" />
            <span className="memory-thread memory-thread-route" />
            <span className="memory-thread memory-thread-stage" />

            <MemoryBlock className="memory-block-index" label="Routing index" meta="4 matches" />
            <MemoryBlock className="memory-block-source" label="Source note" meta="verified" />
            <MemoryBlock
              className="memory-block-history"
              label="Version history"
              meta="immutable"
            />

            <div className="memory-canon-stack">
              <MemoryBlock className="memory-block-version-two" label="Previous canon" meta="v2" />
              <MemoryBlock className="memory-block-version-three" label="Current canon" meta="v3" />
            </div>

            <MemoryBlock
              className="memory-block-staged"
              label="Staged write"
              meta="conflict-free"
            />
          </div>
        </aside>
      </section>
      <WorkflowSection />
      <ControlSection />
      <ArchitectureSection />
      <section className="landing-section landing-cta" data-reveal>
        <div>
          <h2>Connect an agent.</h2>
          <p>Use OAuth to grant each client its own revocable access.</p>
        </div>
        <div className="cta-actions">
          <Link className="button" href="/auth/login">
            Sign in
          </Link>
          <a className="button secondary" href="/docs">
            API reference
          </a>
        </div>
      </section>
      <footer className="landing-footer">
        <span>Owl Memory</span>
        <span>Open source under AGPL-3.0</span>
      </footer>
    </main>
  );
}

function MemoryBlock({
  className,
  label,
  meta,
}: {
  className: string;
  label: string;
  meta: string;
}) {
  return (
    <div className={`memory-block ${className}`}>
      <span className="memory-face memory-face-front">
        <span>{label}</span>
        <strong>{meta}</strong>
      </span>
      <span className="memory-face memory-face-back" />
      <span className="memory-face memory-face-left" />
      <span className="memory-face memory-face-right" />
      <span className="memory-face memory-face-top" />
      <span className="memory-face memory-face-bottom" />
    </div>
  );
}

function WorkflowSection() {
  const steps = [
    {
      code: "route",
      title: "Find the right article.",
      body: "Agents use titles, summaries, keywords, and freshness to choose an article.",
    },
    {
      code: "read",
      title: "Load current canon.",
      body: "The agent reads the full article after the index identifies it.",
    },
    {
      code: "stage",
      title: "Propose a complete change.",
      body: "A staged write includes its base version, source, and conflict candidates.",
    },
    {
      code: "promote",
      title: "Keep the history.",
      body: "Owl Memory creates an immutable version and records an audit event.",
    },
  ];

  return (
    <section className="landing-section workflow-section" id="workflow" tabIndex={-1}>
      <div className="section-copy" data-reveal>
        <h2>Load the right context.</h2>
        <p>
          Agents read a compact index, open the relevant article, and leave the rest of the brain
          untouched.
        </p>
      </div>
      <div className="workflow-detail">
        {steps.map((step) => (
          <article key={step.code} data-reveal>
            <span className="flow-code">{step.code}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ControlSection() {
  return (
    <section className="landing-section control-section">
      <div className="control-copy" data-reveal>
        <h2>Change knowledge without silent overwrites.</h2>
        <p>
          Owl Memory separates proposals from canon. You review conflicts before a write replaces
          the current version.
        </p>
      </div>
      <div className="control-stack">
        <article data-reveal>
          <h3>Versioned canon</h3>
          <p>Readers see one current article. Older versions remain available for recovery.</p>
        </article>
        <article data-reveal>
          <h3>Conflict checks</h3>
          <p>Owl Memory parks a proposal when its base version no longer matches.</p>
        </article>
        <article data-reveal>
          <h3>Portable source</h3>
          <p>Export brains as Markdown and keep storage under your control.</p>
        </article>
      </div>
    </section>
  );
}

function ArchitectureSection() {
  const nodes = [
    ["Clients", "Codex, Claude Code, OpenCode"],
    ["Gateway", "Caddy, OAuth, MCP"],
    ["Application", "Fastify, Next.js, worker"],
    ["Storage", "PostgreSQL, pgvector, Markdown exports"],
  ] as const;

  return (
    <section className="landing-section architecture-section">
      <div className="section-copy" data-reveal>
        <h2>Run it on your own stack.</h2>
        <p>
          The local deployment keeps OAuth, MCP, search, embeddings, and article storage inside one
          controlled environment.
        </p>
      </div>
      <ul className="architecture-path" aria-label="Owl Memory deployment path">
        {nodes.map(([title, body]) => (
          <li key={title} data-reveal>
            <span>{title}</span>
            <strong>{body}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
