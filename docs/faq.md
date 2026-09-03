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
limits and inflates token costs. Rementum minimizes prompt overhead at three layers:

- **Compact routing index (~200 tokens):** Calling `get_brain` returns a lightweight 25-item list of
  article titles and one-sentence summaries. Agents inspect this index and retrieve only the specific
  article needed (`read_article` or `load_context`).
- **OAuth scope-based tool filtering:** The tool catalog is filtered strictly to the scopes granted
  during authentication. Clients never receive definitions for tools they are unauthorized to call.
- **Task and maintenance tools stay deferred:** Client plugins (Claude Code, Cursor, Codex) register
  only core reading and staging skills (`brain-context`, `brain-write`). Task management and
  maintenance candidate tools are invoked on demand rather than crowding everyday prompts.
- **Private catalog caching:** Modern MCP clients receive a 5-minute private `Cache-Control` header
  on the tool catalog, eliminating redundant schema discovery requests.

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

### Is Rementum truly local and private? What about external LLM compaction?

By default, Rementum makes **zero external network requests**:

- **100% local by default:** Multilingual embeddings run locally using the bundled Granite-97M ONNX
  model (`apps/embeddings`), routing summaries are generated locally by the API process, and article
  bodies are encrypted with AES-256-GCM.
- **Double opt-in for compaction:** Deferred title and body compaction is disabled by default. It
  requires an instance-level provider configuration (`REMENTUM_LLM_ENABLED=true`) *and* explicit
  per-workspace activation by a workspace owner or admin.
- **Works with local engines (Ollama, vLLM, LocalAI):** The compaction worker connects to any
  OpenAI-compatible Chat Completions endpoint with JSON Schema support. You can point
  `REMENTUM_LLM_BASE_URL` to a local Ollama or vLLM instance for a completely air-gapped, zero-cloud
  deployment.
