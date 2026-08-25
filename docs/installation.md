# Install Rementum

## Before you start

You need:

- A Linux host with Docker Engine, Docker Compose v2, and OpenSSL
- A domain with an A or AAAA record pointing to the host
- Inbound TCP ports 80 and 443
- An OpenAI-compatible API endpoint and model name

Public registration also needs a Resend API key and a verified sender. Invitation-only instances do
not need an email provider for the first owner.

## Run the installer

```bash
git clone https://github.com/yibudak/rementum.git
cd rementum
./scripts/install.sh
```

The installer asks for the domain, owner account, model, and optional mail settings. It then:

1. Generates database passwords, a 32-byte master key, cookie keys, and a persistent OAuth signing
   key.
2. Writes `.env` with mode `0600` and creates a private `backups/` directory.
3. Builds the containers, runs every pending migration, and waits for the API and web health checks.
4. Creates the first owner and default workspace.

The installer refuses to replace an existing `.env`. Update an existing instance from its Git
checkout with:

```bash
./scripts/update.sh
```

The updater requires an encrypted backup recipient before it changes the source. Follow the
[backup and upgrade guide](operations.md) to configure it. Use `./scripts/deploy.sh` when you only
changed `.env` or want to rebuild the currently checked-out version without fetching an update.

If deployment succeeds but first-owner creation fails, retry that step without changing the
instance secrets:

```bash
./scripts/create-owner.sh owner@example.com "Owner Name"
```

## Verify the instance

```bash
curl --fail https://memory.example.com/healthz
docker compose -f docker-compose.yml -f compose.production.yml ps
```

The health response reports database access and embedding service status. The Compose output should
show healthy API, web, embedding, and PostgreSQL services.

## Save the master key

Copy `.env` into an encrypted secrets manager before you add knowledge. The encrypted backup does
not contain `REMENTUM_MASTER_KEY`. A database and blob backup cannot recover article bodies without
the same master key.

Limit `.env` access to the system administrator. Do not send it through chat, email, issue trackers,
or CI logs.

## Public registration

The installer keeps registration closed unless you enable it. To change the setting later, configure
all three values in `.env`:

```dotenv
REMENTUM_ALLOW_SIGNUP='true'
REMENTUM_RESEND_API_KEY='re_...'
REMENTUM_MAIL_FROM='Rementum <rementum@example.com>'
```

Run `./scripts/deploy.sh` after the change. New accounts must verify their email before they create a
team.
