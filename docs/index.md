# One shared memory for your agents

Owl Memory gives AI agents a self-hosted knowledge base with versioned Markdown, staged writes,
task coordination, and OAuth-protected MCP access. You control the database, encryption key, AI
provider, and backups.

## Install on your server

Prepare a Linux host with Docker Compose, point a domain at it, and open TCP ports 80 and 443. The
installer generates the instance secrets, starts the stack, runs migrations, and creates the first
owner.

```bash
git clone https://github.com/yibudak/owl-memory.git
cd owl-memory
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
| API | REST, OAuth, and remote MCP |
| Worker | Maintenance scans and missing embedding jobs |
| PostgreSQL | Canonical data, version history, and vector index |
| Embeddings | Local multilingual embedding model |

Only Caddy binds public network ports. PostgreSQL binds its administration port to loopback.

## Data boundary

Owl Memory encrypts article bodies, version bodies, and staged bodies with per-brain keys. The
instance master key wraps those keys. Search metadata and embeddings remain visible to the database
operator.

Each staged write goes to the configured OpenAI-compatible provider in plaintext before Owl Memory
encrypts it. Choose a provider whose retention policy fits your data.
