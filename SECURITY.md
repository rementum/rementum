# Security policy

Please report vulnerabilities privately to the maintainers rather than opening a public issue.

## Supported versions

Until 1.0, only the most recent release receives security fixes.

## Deployment invariants

- Only Caddy publishes non-loopback ports in the reference production Compose stack. PostgreSQL's
  administration port binds to `127.0.0.1`.
- PostgreSQL and the embedding service stay on the private Compose network.
- Every workspace-owned row is protected by application authorization and PostgreSQL RLS.
- Article bodies, versions, and staged bodies use application-layer envelope encryption with per-brain data keys.
- The root wrapping key is supplied as `REMENTUM_MASTER_KEY` and never persisted or backed up.
- OAuth access tokens are audience restricted and short lived; refresh tokens rotate.
- Agent writes never bypass the staged-write and promotion protocol.
- The default local summary mode does not send staged candidate bodies to an external LLM.
- Nothing is sent to a provider until both `REMENTUM_LLM_ENABLED=true` is configured and an owner
  or admin enables compaction on a workspace. Then promotion stores the submitted body encrypted
  and queues that exact version; the worker later sends its title and body to the configured
  OpenAI-compatible provider in plaintext and stores the compact result as the next version, keeping
  the submitted version in the article's encrypted history.
  After three failures the submitted body remains canonical and the article is marked failed.
- The API and worker containers of the reference stack never receive the PostgreSQL superuser
  credentials; only the migration, backup, and restore services do.

## Threat model and encryption boundary

Rementum implements application-layer envelope encryption with searchable metadata:

- **Envelope encryption:** Article bodies, versions, and staged write candidates are encrypted with
  AES-256-GCM using per-brain data keys. Each ciphertext is sealed with position-bound Additional
  Authenticated Data (AAD) derived from its brain, article, and version.
- **Key wrapping:** The root wrapping key is supplied as `REMENTUM_MASTER_KEY` via the environment and
  never persisted in the database or backup archives.
- **Searchable metadata:** Article titles, routing summaries, slugs, backlinks, and vector embeddings
  are stored in plaintext in PostgreSQL to enable hybrid search (PostgreSQL FTS + pgvector). They are
  sensitive derived data; administrators should use full-disk and backup encryption in addition to
  Rementum's application-layer encryption.
- **Compaction boundary:** Instances that enable an AI provider must choose one whose retention and
  training policies fit their data requirements, as compaction sends titles and bodies in plaintext.
