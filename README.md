# Owl Memory

Owl Memory is an open-source, self-hosted shared brain for AI agents. It gives Claude,
ChatGPT, Codex, Cursor, and any remote MCP client one versioned, auditable body of knowledge.

The product is deliberately agent-first:

- Knowledge lives in linked Markdown articles with a compact routing index.
- Every canonical change is staged, versioned, attributed, and conflict checked.
- Article bodies are encrypted with a per-brain key.
- Search combines routing metadata, PostgreSQL full-text search, and local multilingual
  embeddings.
- Agents coordinate work through leased tasks and write maintenance proposals back through
  the same staged protocol.
- The whole brain exports as portable Markdown.

## Status

This repository is under active development toward a production beta. The REST and MCP
contracts are versioned, but backward compatibility is not promised until 1.0.

## Local development

Requirements: Node.js 24+, pnpm 10+, and Docker.

The reference Compose stack binds PostgreSQL to loopback port `55432` for local migrations so
it does not collide with a system PostgreSQL installation.

```bash
cp .env.example .env
# Fill OWL_MASTER_KEY and OWL_COOKIE_KEYS. Generate the production signing key with:
pnpm auth:jwks
docker compose up -d postgres
docker compose run --rm api node packages/db/dist/migrate.js
docker compose up -d
```

For host-side development, point the admin migration URL at the loopback port:

```bash
pnpm install
OWL_DATABASE_ADMIN_URL=postgres://postgres:YOUR_ADMIN_PASSWORD@127.0.0.1:55432/owl pnpm db:migrate
pnpm dev
```

Create the first owner after migrations:

```bash
docker compose run --rm \
  -v /absolute/path/to/owner-password:/run/secrets/owl-owner-password:ro \
  api node apps/api/dist/admin.js -- create-owner \
  --email you@example.com --password-file /run/secrets/owl-owner-password
```

The remote MCP endpoint is `https://<your-host>/mcp`. OAuth Protected Resource Metadata is
served from `/.well-known/oauth-protected-resource`.

## Security boundary

Article bodies and version bodies are encrypted. Routing metadata and embeddings remain
searchable and must be treated as sensitive derived data. The master key is not stored in the
database or included in backups.

See [SECURITY.md](SECURITY.md) for reporting and deployment guidance.

## Backup

Set `OWL_BACKUP_AGE_RECIPIENT` to an age public recipient and run:

```bash
docker compose --profile backup run --rm backup
```

The encrypted archive contains PostgreSQL, local blobs, and a versioned manifest. It never contains
`OWL_MASTER_KEY`; escrow that key separately. Host-side equivalents live in `deploy/backup/`.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
