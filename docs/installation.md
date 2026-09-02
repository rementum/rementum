# Install Rementum

## What you need

- A Linux host with Docker Engine, Docker Compose v2, and OpenSSL.
- A domain with an A or AAAA record pointing at the host.
- Open inbound TCP ports 80 and 443.

Two things are optional:

- **An OpenAI-compatible AI provider.** It only makes deferred compaction *available*; every
  workspace still starts with compaction off. The provider and model must support strict JSON Schema
  through Chat Completions.
- **Email (a Resend API key and a verified sender).** You need it for public registration. An
  invitation-only instance does not need email to create the first owner.

## Run the installer

```bash
git clone https://github.com/rementum/rementum.git
cd rementum
./scripts/install.sh
```

The installer asks for the domain, the owner account, and the optional AI, email, and Cloudflare
Turnstile settings. Then it:

1. Generates the database passwords, a 32-byte master key, cookie keys, and an OAuth signing key.
2. Writes `.env` with mode `0600` and creates a private `backups/` directory.
3. Builds the containers, runs every migration, and waits for the API and web health checks.
4. Creates the first owner, a default team, and that team's default workspace.

When it finishes, open the HTTPS URL it printed.

## Install without prompts

Pass `--non-interactive` to run from an agent or a CI job. Set plain values with `REMENTUM_INSTALL_*`
variables, and put passwords and API keys in files so they stay out of the command line and logs:

```bash
REMENTUM_INSTALL_DOMAIN='memory.example.com' \
REMENTUM_INSTALL_OWNER_EMAIL='owner@example.com' \
REMENTUM_INSTALL_OWNER_NAME='Owner' \
REMENTUM_INSTALL_OWNER_PASSWORD_FILE='/run/secrets/rementum-owner-password' \
REMENTUM_INSTALL_LLM_ENABLED='true' \
REMENTUM_INSTALL_LLM_BASE_URL='https://api.openai.com/v1' \
REMENTUM_INSTALL_LLM_MODEL='your-model' \
REMENTUM_INSTALL_LLM_API_KEY_FILE='/run/secrets/rementum-llm-api-key' \
REMENTUM_INSTALL_ALLOW_SIGNUP='false' \
./scripts/install.sh --non-interactive
```

A few rules for this mode:

- The owner password must be at least 12 characters, read from `REMENTUM_INSTALL_OWNER_PASSWORD_FILE`.
- External AI and public signup both default to `false`.
- Omit every AI input to keep submitted titles and bodies and use local summaries. To make
  compaction available, set `REMENTUM_INSTALL_LLM_ENABLED=true` with a base URL and a
  JSON-Schema-capable model; omit the API key file for a keyless endpoint. Turn compaction on later
  per workspace, from its team page.
- To allow signup, also set `REMENTUM_INSTALL_RESEND_API_KEY_FILE` and `REMENTUM_INSTALL_MAIL_FROM`.
- To add Cloudflare Turnstile bot protection, set `REMENTUM_INSTALL_TURNSTILE_SITE_KEY` and store the
  secret in `REMENTUM_INSTALL_TURNSTILE_SECRET_KEY_FILE`. The installer refuses one without the other.

Run `./scripts/install.sh --help` for the full list. This mode uses the same safety checks as the
interactive installer.

## Update or repair

The installer refuses to overwrite an existing `.env`. To update an installed instance from its Git
checkout:

```bash
./scripts/update.sh
```

The updater requires an encrypted backup recipient before it touches the source. Set one up with the
[backup and upgrade guide](operations.md). Use `./scripts/deploy.sh` when you only changed `.env`, or
to rebuild the current version without pulling an update.

If deployment succeeds but creating the first owner fails, retry just that step. It does not change
any secret:

```bash
./scripts/create-owner.sh owner@example.com "Owner Name"
```

## Check that it works

```bash
curl --fail https://memory.example.com/healthz
docker compose -f docker-compose.yml -f compose.production.yml ps
```

The health response reports database and embedding status. The Compose output should show healthy
API, web, embedding, and PostgreSQL services.

The embedding service is the last to go healthy: it downloads its model on first start. The
installer waits for it.

## Save the master key

Copy `.env` into an encrypted secrets manager before you add any knowledge. **The encrypted backup
does not contain `REMENTUM_MASTER_KEY`.** Without the same master key, no database or blob backup can
recover article bodies.

Limit `.env` to the system administrator. Never send it through chat, email, issue trackers, or CI
logs.

## Turn on public registration

Registration stays closed unless you enable it. To open it later, set all three values in `.env`:

```dotenv
REMENTUM_ALLOW_SIGNUP='true'
REMENTUM_RESEND_API_KEY='re_...'
REMENTUM_MAIL_FROM='Rementum <rementum@example.com>'
```

Run `./scripts/deploy.sh` afterward. New accounts must verify their email before they can create a
team.
