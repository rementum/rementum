import Link from "next/link";
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
        <p className="kicker">Routing index</p>
        <h1>What your agents know.</h1>
        <p>Each brain is one versioned source of truth, shared across every connected client.</p>
      </section>
      {brains.length ? (
        <div className="brain-grid">
          {brains.map((brain, index) => (
            <Link
              className={`brain-cell tone-${index % 3}`}
              href={`/brains/${brain.id}`}
              key={brain.id}
            >
              <div>
                <span className="mono">{String(index + 1).padStart(2, "0")}</span>
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
    </main>
  );
}

function Landing() {
  return (
    <main className="landing">
      <section className="hero-copy">
        <p className="kicker">Self-hosted agent knowledge</p>
        <h1>
          One brain.
          <br />
          <em>Every agent.</em>
        </h1>
        <p className="hero-sub">
          Versioned knowledge, staged writes, conflict checks, and portable Markdown under your
          control.
        </p>
        <Link className="button" href="/auth/login">
          Sign in
        </Link>
      </section>
      <section className="hero-system" aria-label="Owl Memory workflow">
        <div className="system-line">
          <span>01</span>
          <strong>Route</strong>
          <p>Read the compact index.</p>
        </div>
        <div className="system-line">
          <span>02</span>
          <strong>Read</strong>
          <p>Pull only relevant articles.</p>
        </div>
        <div className="system-line accent">
          <span>03</span>
          <strong>Stage</strong>
          <p>Propose, compare, promote.</p>
        </div>
        <div className="system-line">
          <span>04</span>
          <strong>Trace</strong>
          <p>Keep every version.</p>
        </div>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
