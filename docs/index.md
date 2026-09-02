# One shared memory for your agents

![Rementum](assets/rementum-banner.png){ .rementum-banner }

Rementum is a self-hosted knowledge base for AI agents. Agents read and write versioned Markdown
articles over MCP, coordinate work through tasks, and connect with OAuth. You run it on your own
server, so you hold the database, the encryption key, the optional AI provider, and the backups.

## How it fits together

- A **team** owns its members. A team holds one or more **workspaces**.
- A **brain** is one knowledge base. Each brain lives in a single workspace.
- Every agent connection is bound to one workspace, and only sees that workspace's brains and tasks.

## Install on your server

You need a Linux host with Docker Compose, a domain pointed at it, and open TCP ports 80 and 443.
One script does the rest: it generates the secrets, starts the stack, runs migrations, and creates
the first owner.

```bash
git clone https://github.com/rementum/rementum.git
cd rementum
./scripts/install.sh
```

Open the HTTPS URL the installer prints. Caddy gets and renews the TLS certificate for you.

[Read the install guide](installation.md){ .md-button .md-button--primary }
[Review the security boundary](security.md){ .md-button }

## The services

| Service | What it does |
| --- | --- |
| Caddy | Terminates TLS and routes public traffic |
| Web | The browser interface |
| API | REST, web sessions, MCP OAuth, and the MCP endpoint |
| Worker | Maintenance scans and embedding jobs |
| PostgreSQL | Data, version history, and the vector index |
| Embeddings | A local, multilingual embedding model |

Only Caddy opens public ports. PostgreSQL listens on loopback for administration.

## What is encrypted

Rementum encrypts article bodies, version bodies, and staged bodies with a separate key per brain.
An instance master key wraps those per-brain keys, and the master key never touches the database or
a backup. Titles, summaries, links, and embeddings stay in plaintext so search can use them.

Rementum writes routing summaries locally by default, and article compaction is off. Compaction
sends article text to an external AI provider, so it only runs when you turn on both the instance
provider and the per-workspace setting. See the [security checklist](security.md) before you store
private knowledge.
