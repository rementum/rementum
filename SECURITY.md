# Security policy

Please report vulnerabilities privately to the maintainers rather than opening a public issue.

## Supported versions

Until 1.0, only the most recent release receives security fixes.

## Deployment invariants

- Only Caddy publishes non-loopback ports in the reference production Compose stack. PostgreSQL's
  administration port binds to `127.0.0.1`.
- PostgreSQL and the embedding service stay on the private Compose network.
- Every workspace-owned row is protected by application authorization and PostgreSQL RLS.
- Article bodies, versions, and staged bodies are encrypted with per-brain data keys.
- The root wrapping key is supplied as `REMENTUM_MASTER_KEY` and never persisted or backed up.
- OAuth access tokens are audience restricted and short lived; refresh tokens rotate.
- Agent writes never bypass the staged-write and promotion protocol.
- The API requires `REMENTUM_LLM_ENABLED=true`. It sends each staged candidate body in plaintext to the
  configured OpenAI-compatible provider before encrypting the staged body.

Metadata and embeddings are not covered by article-body encryption. Administrators should use
full-disk and backup encryption in addition to Rementum's application-layer encryption. They
must also choose an AI provider whose retention and training policies fit their data requirements.
