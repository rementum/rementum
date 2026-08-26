# Configuration

Rementum reads `.env` through Docker Compose. The installer writes production values. Start from
`.env.example` only when you manage setup by hand.

## Public endpoint and authentication

| Variable | Purpose |
| --- | --- |
| `REMENTUM_DOMAIN` | Caddy hostname without a scheme or path |
| `REMENTUM_PUBLIC_URL` | Public HTTPS origin shared by the web app, session API, and MCP OAuth endpoints |
| `REMENTUM_MASTER_KEY` | Base64-encoded 32-byte key that wraps every brain data key |
| `REMENTUM_COOKIE_KEYS` | Comma-separated cookie signing keys |
| `REMENTUM_JWT_JWKS` | Private RSA JWKS used to sign OAuth tokens |
| `REMENTUM_ALLOW_SIGNUP` | Enables public registration when set to `true` |
| `REMENTUM_DEV_AUTH` | Enables the development identity header; rejected when `NODE_ENV=production` |
| `REMENTUM_TRUSTED_PROXIES` | Reverse proxies whose `X-Forwarded-For` entries are trusted, as IPs, CIDRs, or the `loopback`, `linklocal`, and `uniquelocal` presets; empty when the API is exposed directly |

The production Compose override sets `NODE_ENV=production`. The API rejects a non-HTTPS public URL
or a missing persistent JWKS in that mode.

Browser sign-in uses a 14-day, server-side session stored as a hashed opaque token. OAuth is not
used for the web app; it is exposed only for workspace MCP connections.

Do not replace `REMENTUM_MASTER_KEY` on an existing instance. Rementum will lose access to every
wrapped brain key. Keep the original value with your disaster-recovery material.

## Article generation

| Variable | Purpose |
| --- | --- |
| `REMENTUM_LLM_ENABLED` | Uses an external OpenAI-compatible provider when set to `true`; defaults to `false` |
| `REMENTUM_LLM_BASE_URL` | API root that contains `/chat/completions` |
| `REMENTUM_LLM_MODEL` | Provider model identifier |
| `REMENTUM_LLM_API_KEY` | Provider credential; keyless local endpoints may leave it empty |
| `REMENTUM_LLM_REASONING_EFFORT` | Optional `none`, `minimal`, `low`, `medium`, or `high` request value |
| `REMENTUM_LLM_TIMEOUT_MS` | Generation request timeout |
| `REMENTUM_LLM_MAX_INPUT_CHARS` | Maximum source characters per generation chunk |
| `REMENTUM_LLM_CONCURRENCY` | Maximum concurrent generation requests |
| `REMENTUM_COMPACTION_POLL_MS` | Worker delay between queue polls; defaults to 2 seconds |

With the default `REMENTUM_LLM_ENABLED=false`, Rementum preserves the submitted title and body and
derives a deterministic one-sentence routing summary inside the instance. It does not make an
external LLM request, and staging, conflict checks, routing, and search remain available.

Set `REMENTUM_LLM_ENABLED=true` together with a base URL and model to make deferred compaction
available. This does not send content by itself: every existing and new workspace starts with
compaction off, and an owner or admin must enable it from the team page.

Staging never calls the provider. Promotion stores the submitted version encrypted and queues it for
the worker. The provider receives the title and body in plaintext and must support strict JSON Schema
through the Chat Completions `response_format` field. It returns a title of at most 120 characters, a
one-sentence summary of at most 300 characters, and a Markdown body of at most 1,500 characters. A
successful job overwrites the same encrypted version, removing the submitted body. Jobs retry after
1 and 5 minutes; after the third failure the submitted body remains canonical and the article can be
retried manually.

Enabling a workspace affects future promoted versions. Use **Compact existing** to queue only the
current version of existing articles; historical versions are not changed. Turning compaction off
cancels queued jobs. A request already sent to the provider cannot be recalled, but its result is
discarded when the worker sees that the workspace is off.

## Email

Set `REMENTUM_RESEND_API_KEY` and `REMENTUM_MAIL_FROM` together. Leave both empty when the instance
does not send registration, invitation, or password-reset email.

Public registration requires email delivery:

```dotenv
REMENTUM_ALLOW_SIGNUP='true'
REMENTUM_RESEND_API_KEY='re_...'
REMENTUM_MAIL_FROM='Rementum <rementum@example.com>'
```

## Storage and search

| Variable | Purpose |
| --- | --- |
| `REMENTUM_POSTGRES_PASSWORD` | Application database role password |
| `REMENTUM_POSTGRES_SUPER_PASSWORD` | Migration and backup database password |
| `REMENTUM_EMBEDDING_MODEL` | Model loaded by the embedding service |
| `REMENTUM_BLOB_DIR` | Blob storage path inside API and worker containers |
| `REMENTUM_EXPORT_DIR` | Export workspace inside API and worker containers |
| `REMENTUM_BACKUP_HOST_DIR` | Host directory that receives encrypted backup archives |
| `REMENTUM_BACKUP_AGE_RECIPIENT` | Age recipient required by the backup command |

The Compose file creates named volumes for PostgreSQL, blobs, Caddy state, and the embedding model
cache. `REMENTUM_BACKUP_HOST_DIR` uses a host bind mount so you can move encrypted archives off the
server.
