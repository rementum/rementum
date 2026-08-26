# Security checklist

Complete these checks before you store private knowledge.

## Network

- Publish TCP ports 80 and 443 from Caddy.
- Keep the Docker daemon, database administration port, and SSH access behind a firewall.
- Confirm `REMENTUM_PUBLIC_URL` uses the same HTTPS origin as `REMENTUM_DOMAIN`.
- Keep `REMENTUM_DEV_AUTH=false` in production.

The reference Compose file binds PostgreSQL to `127.0.0.1` for administration. It does not expose
PostgreSQL or the embedding service to the public network.

## Secrets

- Restrict `.env` to the deployment administrator.
- Escrow `REMENTUM_MASTER_KEY` outside the server and outside database backups.
- Use generated database, cookie, and OAuth signing keys.
- Keep provider keys and Resend keys out of source control and support logs.

Rementum encrypts article content at the application layer. PostgreSQL still stores routing
summaries, titles, links, audit metadata, and embeddings. Use encrypted disks and encrypted backups.

## Routing summary mode

The default local mode derives routing summaries inside the API process and does not send staged
candidate bodies to an external LLM. The derived summary remains searchable metadata and is not
covered by article-body encryption.

When `REMENTUM_LLM_ENABLED=true`, the API sends each complete staged candidate body to the configured
OpenAI-compatible provider for summary generation. Review that provider's retention, training,
regional processing, and access policies before you connect it.

## Accounts

Keep public registration disabled unless you need it. Public registration requires verified email
delivery and applies request rate limits. Use team invitations for controlled access and remove
members who no longer need access to the team's workspaces.

Team owners and admins can create or rename workspaces. Only the team owner can delete one, the
last workspace is protected, and deletion requires the exact workspace name because it permanently
removes every brain and note inside that workspace.

## Backups

The backup job refuses to create an unencrypted archive. Test a restore on a separate host and keep
the age identity apart from the archives. A valid archive without `REMENTUM_MASTER_KEY` cannot decrypt
article bodies.

Report vulnerabilities through the private channel named in the repository `SECURITY.md`. Do not
open a public issue with exploit details or instance secrets.
