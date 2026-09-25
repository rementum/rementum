# Architecture decisions and FAQ

This page explains why Rementum is designed the way it is, the engineering trade-offs we chose,
and answers to common technical and licensing questions.

## Architecture and design decisions

### Why not just Git and Markdown files in a repository?

Git is built for human programmers who manually resolve diffs with visual merge tools. When AI
agents write directly to Git:

1. **Conflict markers break agent execution:** Git flags a conflict by inserting markers like
   `<<<<<<< HEAD`. An agent that encounters these markers cannot easily reason about syntactic
   intent, fails linter checks, and often hallucinates corrupt edits into code files. Rementum's
   **staged write protocol** isolates proposals on the server (`parked as a conflict`) so live canon
   is never broken.
2. **Context window exhaustion:** Scanning a Git repository with hundreds of files quickly consumes
   an agent's context window and inflates API token costs. Rementum uses a **compact routing index**
   (~200 tokens) so agents open only the specific article they need.
3. **Runtime coordination and locking:** Git lacks runtime leases. When multiple agents (e.g. Claude
   Code in your terminal and Cursor in your IDE) edit simultaneously, they overwrite each other's
   files without coordination. Rementum provides **leased tasks** with heartbeats and attribution,
   preventing duplicate work.

### Why PostgreSQL and pgvector instead of SQLite or a single binary?

Rementum is built for **teams and concurrent agent swarms**, not just a single CLI session:

- **Row-Level Security (RLS):** Every store method executes within PostgreSQL transactions
  configured with actor-scoped session variables (`owl_can_read_brain`, `owl_can_edit_brain`).
  Multi-tenant data isolation is enforced at the database engine level, preventing privilege
  escalation even if application memory is compromised.
- **Transactional consistency:** Promoting a staged write, creating an immutable version,
  updating links, and recording an audit event happen atomically in a single ACID transaction.
- **Hybrid search at scale:** `packages/core/src/search.ts` executes reciprocal rank fusion across
  PostgreSQL full-text search (BM25-style ranking via `tsvector`), routing metadata, and pgvector
  HNSW cosine distance. SQLite lacks production-grade, transactional vector and multi-tenant RLS
  capabilities.

*(Note: An embedded single-node mode for personal local-only use is on our future roadmap.)*

### Why are article bodies encrypted while metadata remains plaintext?

This is an intentional and calculated engineering trade-off:

- Real-time search over encrypted vectors (e.g. using Fully Homomorphic Encryption) is currently
  too computationally expensive for millisecond-latency agent workflows.
- Titles, routing summaries, wiki links, and vector embeddings remain plaintext so the search
  engine can quickly rank relevant articles.
- Article and version bodies are encrypted at rest with **AES-256-GCM** using a unique data key per
  brain, sealed with additional authenticated data (AAD) binding ciphertext to its exact position.
  The master key never touches the database or backups.
- If a database dump is compromised, deep internal notes, sensitive proprietary snippets, and article
  bodies remain undecryptable. See the [security guide](security.md) for details.

## Context and token efficiency

### How does Rementum protect agent context windows and token budgets?

Dumping entire documentation directories or files into an agent's prompt quickly exhausts context
limits and inflates token costs. Rementum minimizes prompt overhead in several ways:

- **Compact routing index (~200 tokens):** Calling `get_brain` returns a lightweight 25-item list of
  article titles and one-sentence summaries. Agents inspect this index and retrieve only the specific
  article needed (`read_article` or `load_context`).
- **OAuth scope-based tool filtering:** The tool catalog is filtered strictly to the scopes granted
  during authentication. Clients never receive definitions for tools they are unauthorized to call.
- **Seven memory tools:** The single `rementum` skill covers brain discovery, reading, staging,
  and promotion. Task management, maintenance, import/export, and invitations use the web UI or
  REST API and do not add MCP tool definitions.
- **Private catalog caching:** Modern MCP clients receive a 5-minute private `Cache-Control` header
  on the tool catalog, eliminating redundant schema discovery requests.

## Interface languages

### Which languages does the web interface support?

You can use the homepage, dashboard, workspace analytics, brain pages (including import and
maintenance), articles, writes, tasks, teams, invitations, connections, admin pages, and account
flows in **English**, **Simplified Chinese (中文)**, and **Turkish (Türkçe)**.

- **Homepage:** each language has its own URL (`/`, `/zh`, and `/tr`) with its own canonical URL
  and `hreflang` links, so search engines see three real translated pages rather than one
  cookie-dependent one. Each is cached and revalidated every 60 seconds. They are deliberately
  *not* prerendered at build time: the language the page shell renders in comes from the request,
  so freezing the HTML would ship `/zh` with `lang="en"` and an English navigation.
- **Dashboard:** use the language switcher (`EN` / `中文` / `Türkçe`) in the sidebar. The choice is
  stored in the `rementum_locale` cookie; without one, the dashboard follows the browser's
  `Accept-Language`. Off the homepage the switcher keeps you on the page you are on and re-renders
  it in the new language instead of sending you back to the marketing site.

The homepage stays in the public shell when you are signed in: the sidebar is the app's frame, and
the marketing page is not laid out inside it. The account buttons in the header and the footer
become a **Dashboard** link in that case, so the page still leads into the app.

Every signed-in page and account flow follows your chosen language, including the navigation shell
(sidebar, header, footer, and language switcher) and the labels, dates, relative times, and number
formatting inside each page. Analytics heatmap days still follow UTC, whatever the language.

English product terms stay English in Turkish, `brain` among them, and keep English capitalization
inside Turkish labels: `AKTİF BRAIN`, not `AKTİF BRAİN`.

The emergency error screen keeps an English fallback because it must work when server rendering
fails. The `/docs` site, API messages (including errors shown in forms), and email templates remain
in English.

User content (brain names, article titles and bodies, comments) is never translated, and neither
are shell commands, MCP URLs, or slugs.

### Is the repository README translated?

Yes. `README.md` is the English source, and [`README.tr.md`](https://github.com/rementum/rementum/blob/main/README.tr.md)
and [`README.zh.md`](https://github.com/rementum/rementum/blob/main/README.zh.md) are the Turkish and
Simplified Chinese translations. Each links to the others at the top.

The English file is canonical. When a translation drifts, treat the English text as correct; the
translated files carry a note saying so. Shell commands, MCP URLs, and identifiers stay
untranslated in all three; only prose is translated.

## Licensing and privacy

### Can my company or startup use Rementum internally under AGPL-3.0?

**Yes.** Rementum is an independent network service that agents connect to over standard network
protocols (MCP / HTTP).

- **Internal usage is not distribution:** Self-hosting Rementum inside your organization or team
  does not trigger copyleft requirements or require opening your proprietary code, applications, or
  private knowledge.
- **Why AGPL-3.0?** The license prevents cloud platforms or closed-source SaaS wrappers from
  taking Rementum, packaging it as a commercial service, and withholding their improvements. If you
  modify Rementum itself and provide it as a public network service to third parties, those
  modifications must remain open source.

### Is Rementum truly local and private?

By default, Rementum makes **zero external network requests**:

- **100% local:** Multilingual embeddings run locally using the bundled Granite-97M ONNX model
  (`apps/embeddings`), routing summaries are written by the agent with each `stage_write`, and article bodies
  are encrypted with AES-256-GCM.
- **No AI provider to configure:** Rementum has no external model integration. Titles, summaries,
  and bodies never leave the instance, so there is no retention or training policy to review. The
  only optional outbound calls are transactional email and Cloudflare Turnstile, both off by default.
