# Security checklist

Complete these checks before you store private knowledge.

## Network

- Publish TCP ports 80 and 443 from Caddy.
- Keep the Docker daemon, database administration port, and SSH access behind a firewall.
- Confirm `REMENTUM_PUBLIC_URL` uses the same HTTPS origin as `REMENTUM_DOMAIN`.
- Keep `REMENTUM_DEV_AUTH=false` in production. The API refuses to start with it enabled there.
- Keep `REMENTUM_TRUSTED_PROXIES` limited to the reverse proxies you actually run. Every address
  in that list can spoof its client address and reset its rate-limit bucket. Pin the proxy's
  address when clients reach Rementum from a private network, because the default
  `loopback,uniquelocal` preset trusts any private address.

The reference Compose file binds PostgreSQL to `127.0.0.1` for administration. It does not expose
PostgreSQL or the embedding service to the public network.

## Secrets

- Restrict `.env` to the deployment administrator.
- Escrow `REMENTUM_MASTER_KEY` outside the server and outside database backups.
- Use generated database, cookie, and OAuth signing keys.
- Keep provider keys and Resend keys out of source control and support logs.

Rementum encrypts article content at the application layer. PostgreSQL still stores routing
summaries, titles, links, audit metadata, and embeddings. Use encrypted disks and encrypted backups.

## Article generation mode

The default local mode preserves submitted titles and bodies, derives routing summaries inside the
API process, and does not send staged candidates to an external LLM. External provider configuration
does not send data by itself: compaction must also be enabled on a workspace. The derived summary
remains searchable metadata and is not covered by article-body encryption.

When both settings are enabled, promotion temporarily keeps the submitted version encrypted while a
background job is queued. The worker sends its title and body to the configured OpenAI-compatible
provider. A successful result overwrites that exact version, removing the submitted body. After
three failures the submitted body remains canonical and the article exposes a failed status. Turning
workspace compaction off cancels queued jobs, but cannot recall a provider request already in flight.
Review the provider's retention, training, regional processing, and access policies before enabling
it.

## Accounts

Keep public registration disabled unless you need it. Public registration requires verified email
delivery and applies request rate limits. Use team invitations for controlled access and remove
members who no longer need access to the team's workspaces.

The web interface uses a 14-day opaque session cookie. Only its hash is stored in PostgreSQL; logout
revokes the current session and a password reset revokes every web session and MCP OAuth grant for
the account. OAuth bearer tokens are accepted only at the exact workspace MCP URL, not by the REST
API. The MCP consent screen is therefore expected only while connecting an agent.

Team owners and admins can create or rename workspaces. Only the team owner can delete one, the
last workspace is protected, and deletion requires the exact workspace name because it permanently
removes every brain and note inside that workspace.

## Backups

The backup job refuses to create an unencrypted archive. Test a restore on a separate host and keep
the age identity apart from the archives. A valid archive without `REMENTUM_MASTER_KEY` cannot decrypt
article bodies.

Report vulnerabilities through the private channel named in the repository `SECURITY.md`. Do not
open a public issue with exploit details or instance secrets.
