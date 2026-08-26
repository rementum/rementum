# Rementum

![Rementum](docs/assets/rementum-banner.png)

Rementum is an open-source, self-hosted shared brain for AI agents. It gives Claude,
ChatGPT, Codex, Cursor, and any remote MCP client one versioned, auditable body of knowledge.

The product is deliberately agent-first:

- Knowledge lives in linked Markdown articles with a compact routing index.
- Every canonical change is staged, versioned, attributed, and conflict checked.
- Article bodies are encrypted with a per-brain key.
- Rementum creates a one-sentence routing summary locally. Workspace owners can opt into deferred
  title, summary, and Markdown-body compaction through an OpenAI-compatible AI provider.
- Search combines routing metadata, PostgreSQL full-text search, and local multilingual
  embeddings.
- Agents coordinate work through leased tasks and write maintenance proposals back through
  the same staged protocol.
- The whole brain exports as portable Markdown.

## Status

This repository is under active development toward a production beta. The REST and MCP
contracts are versioned, but backward compatibility is not promised until 1.0.

## Self-host

Point a domain at a Linux host with Docker Compose, open ports 80 and 443, then run:

```bash
git clone https://github.com/yibudak/rementum.git
cd rementum
./scripts/install.sh
```

The installer generates the instance secrets, builds the stack, runs migrations, waits for health
checks, and creates the first owner. Caddy provisions HTTPS. See the
[installation guide](docs/installation.md) for requirements and recovery steps.

After configuring encrypted backups, update an installed instance with:

```bash
./scripts/update.sh
```

It backs up the instance, fast-forwards the source, runs migrations, rebuilds the services, and
waits for their health checks. See the [operations guide](docs/operations.md) for backup setup and
recovery.

## Documentation

The [MkDocs site](docs/index.md) covers configuration, backups, upgrades, security, and agent
connections. Build it with:

```bash
python3 -m pip install -r docs/requirements.txt
mkdocs build --strict
```

For development setup and checks, read [docs/development.md](docs/development.md).

## Security boundary

Article bodies and version bodies are encrypted at rest. External LLM capability and workspace
compaction are both disabled by default. When both are enabled, promotion stores the submitted body
encrypted and queues the exact version; the worker later sends its title and body to the provider in
plaintext. On success the same version is overwritten with the compact generated body, so the
submitted body is no longer retained. After three failures the submitted body remains canonical and
the article is marked failed. Routing metadata and embeddings remain searchable and must be treated
as sensitive derived data. The master key is not stored in the database or included in backups.

See [SECURITY.md](SECURITY.md) and the [security checklist](docs/security.md) before storing private
knowledge.

## Backup

Set `REMENTUM_BACKUP_AGE_RECIPIENT` to an age public recipient and run:

```bash
docker compose --profile backup run --rm backup
```

The encrypted archive contains PostgreSQL, local blobs, and a versioned manifest. It never contains
`REMENTUM_MASTER_KEY`; escrow that key separately. Read [the operations guide](docs/operations.md)
before you test a restore.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
