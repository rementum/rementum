# Security checklist

Work through these before you store private knowledge.

## Network

- Publish only TCP 80 and 443, from Caddy.
- Keep the Docker daemon, the database admin port, and SSH behind a firewall.
- Confirm `REMENTUM_PUBLIC_URL` uses the same HTTPS origin as `REMENTUM_DOMAIN`.
- Keep `REMENTUM_DEV_AUTH=false` in production. The API refuses to start with it on there.
- Keep `REMENTUM_TRUSTED_PROXIES` limited to the reverse proxies you actually run. Any address in
  that list can spoof its client address and reset its rate-limit bucket. Pin the proxy's address
  when clients reach Rementum from a private network, because the default `loopback,uniquelocal`
  preset trusts any private address.

The reference Compose file binds PostgreSQL to `127.0.0.1` for administration. It does not expose
PostgreSQL or the embedding service to the public network.

## Secrets

- Restrict `.env` to the deployment administrator.
- Escrow `REMENTUM_MASTER_KEY` off the server and out of database backups.
- Use generated database, cookie, and OAuth signing keys.
- Keep provider keys and Resend keys out of source control and support logs.
- Leave the superuser blanks in `docker-compose.yml` in place: the `api` and `worker` services
  override `REMENTUM_DATABASE_ADMIN_URL` and `REMENTUM_POSTGRES_SUPER_PASSWORD` with empty values
  so a superuser connection, which bypasses row-level security, never exists inside those
  containers. Only `migrate`, `backup`, and `restore` receive it.
- The API, worker, and embedding images contain only production dependencies and built output,
  every service runs with `no-new-privileges`, and the Node services drop all Linux capabilities.

## Envelope encryption and data boundary

Rementum implements **application-layer envelope encryption with searchable metadata**:

- **Envelope encryption:** Article bodies, version history, and staged bodies are encrypted with
  AES-256-GCM under individual per-brain data keys. The instance master key wraps those data keys and
  is held in memory; it is never stored in PostgreSQL or included in database backups.
- **Position-bound authentication (AAD):** Every version body is sealed with Additional Authenticated
  Data that names its brain, article, and version number. Readers recompute that value from the row's
  position rather than trusting a stored copy, so ciphertext moved between versions or articles fails
  to decrypt.
- **Searchable metadata (plaintext):** PostgreSQL stores routing summaries, titles, slugs, links,
  audit metadata, MCP usage metadata, and vector embeddings in plaintext so hybrid metadata, full-text,
  and vector search operate without decrypting article bodies. MCP usage metadata is limited to the
  workspace and optional brain/article ids, the OAuth client id and name, the tool name, and the
  timestamp (it does **not** keep tool arguments, prompts, queries, outputs, errors, IP addresses, or
  user ids). Use encrypted disks and encrypted backups.

## Article generation mode

The default local mode keeps submitted titles and bodies, derives routing summaries inside the API
process, and sends no staged candidate to an external LLM. Configuring an external provider does not
send data by itself. Compaction must also be enabled on a workspace. The derived summary is
searchable metadata and is not covered by article-body encryption.

When both settings are on, promotion keeps the submitted version encrypted while a background job is
queued. The worker sends its title and body to the configured OpenAI-compatible provider. A success
becomes the article's next encrypted version; the submitted version remains in history and the
provider's output never replaces the only copy. After three failures the submitted body stays
canonical and the article shows a failed status; the worker's maintenance pass keeps requeueing
failed articles, so failed content is sent to the provider again until compaction succeeds or the
workspace turns it off. Turning workspace compaction off cancels queued jobs but cannot recall a
request already in flight. Review the provider's retention, training, regional processing, and access
policies before you enable it.

An agent connected over MCP can propose a brain invitation but never receives a link: the proposal
waits on the brain page until an owner approves it in the browser, which is also where the link is
issued and sent. An instruction planted in an article the agent read therefore cannot grant anyone
access on its own.

## Accounts

Keep public registration off unless you need it. When on, it requires verified email delivery and
applies request rate limits. Prefer team invitations for controlled access, and remove members who no
longer need the team's workspaces.

The web interface uses a 14-day opaque session cookie. PostgreSQL stores only its hash. Logout revokes
the current session; a password reset revokes every web session and MCP OAuth grant for the account.
OAuth bearer tokens are accepted only at the exact workspace MCP URL, never by the REST API, so the
MCP consent screen appears only while you connect an agent.

Deletion is permanent, immediate, and web-only. There is no trash, and MCP agents cannot delete
anything:

- **Workspaces.** Owners and admins create or rename them; only the team owner deletes one. The last
  workspace is protected, and deletion needs the exact workspace name, because it permanently removes
  every brain, note, and MCP usage record inside. Revoking a connection or deleting one brain does
  not erase that workspace's historical usage metadata; it lasts until the workspace is deleted.
- **Brains.** Only the brain owner deletes a brain, and deletion needs the exact name. It also
  destroys the only copy of the brain's wrapped data key, so its encrypted bodies become
  unrecoverable even from backups taken afterward.
- **Teams.** Only the team owner deletes a team, a user's last team is protected, and deletion needs
  the exact name.

## Backups

The backup job refuses to write an unencrypted archive. Test a restore on a separate host, and keep
the age identity apart from the archives. A valid archive without `REMENTUM_MASTER_KEY` cannot decrypt
article bodies.

Report vulnerabilities through the private channel named in the repository `SECURITY.md`. Do not open
a public issue with exploit details or instance secrets.
