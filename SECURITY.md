# Security policy

Please report vulnerabilities privately to the maintainers rather than opening a public issue.

## Supported versions

Until 1.0, only the most recent release receives security fixes.

## Deployment invariants

- Only Caddy publishes ports in the reference production Compose stack.
- PostgreSQL and the embedding service stay on the private Compose network.
- Every workspace-owned row is protected by application authorization and PostgreSQL RLS.
- Article bodies, versions, and staged bodies are encrypted with per-brain data keys.
- The root wrapping key is supplied as `OWL_MASTER_KEY` and never persisted or backed up.
- OAuth access tokens are audience restricted and short lived; refresh tokens rotate.
- Agent writes never bypass the staged-write and promotion protocol.

Metadata and embeddings are not covered by article-body encryption. Administrators should use
full-disk and backup encryption in addition to Owl Memory's application-layer encryption.
