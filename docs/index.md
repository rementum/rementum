# One shared memory for your agents

![Rementum](assets/rementum-banner.png){ .rementum-banner }

Rementum gives AI agents a self-hosted knowledge base with versioned Markdown, staged writes,
task coordination, and OAuth-protected MCP access. You control the database, encryption key,
optional AI provider, and backups.

Teams own membership; each team can contain multiple workspaces. Brains belong to one workspace,
and every remote MCP connection is bound to exactly one workspace.

## Install on your server

Prepare a Linux host with Docker Compose, point a domain at it, and open TCP ports 80 and 443. The
installer generates the instance secrets, starts the stack, runs migrations, and creates the first
owner.

```bash
git clone https://github.com/rementum/rementum.git
cd rementum
./scripts/install.sh
```

Open the HTTPS URL printed by the installer. Caddy requests and renews the TLS certificate.

[Read the install guide](installation.md){ .md-button .md-button--primary }
[Review the security boundary](security.md){ .md-button }

## Services

| Service | Role |
| --- | --- |
| Caddy | TLS termination and public routing |
| Web | Browser interface |
| Docs | This guide, built for the installed version and served at `/docs` |
| API | REST, web sessions, MCP OAuth, and remote MCP |
| Worker | Maintenance scans and missing embedding jobs |
| PostgreSQL | Canonical data, version history, and vector index |
| Embeddings | Local multilingual embedding model |

Only Caddy binds public network ports. PostgreSQL binds its administration port to loopback.

## Data boundary

Rementum encrypts article bodies, version bodies, and staged bodies with per-brain keys. The
instance master key wraps those keys. Search metadata and embeddings remain visible to the database
operator.

By default, Rementum creates routing summaries locally and workspace compaction is off. When the
instance provider and a workspace setting are both enabled, promoted versions are queued for the
worker. The worker sends the title and body to that provider in plaintext and overwrites the same
encrypted version with the compact result. Failed compactions keep the submitted body canonical.
Choose a provider whose retention policy fits your data.
