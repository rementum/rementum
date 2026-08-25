# Configuration

Rementum reads `.env` through Docker Compose. The installer writes production values. Start from
`.env.example` only when you manage setup by hand.

## Public endpoint and authentication

| Variable | Purpose |
| --- | --- |
| `REMENTUM_DOMAIN` | Caddy hostname without a scheme or path |
| `REMENTUM_PUBLIC_URL` | Public HTTPS origin used by OAuth, REST metadata, and MCP |
| `REMENTUM_MASTER_KEY` | Base64-encoded 32-byte key that wraps every brain data key |
| `REMENTUM_COOKIE_KEYS` | Comma-separated cookie signing keys |
| `REMENTUM_JWT_JWKS` | Private RSA JWKS used to sign OAuth tokens |
| `REMENTUM_ALLOW_SIGNUP` | Enables public registration when set to `true` |
| `REMENTUM_DEV_AUTH` | Enables the development identity header; keep `false` in production |

The production Compose override sets `NODE_ENV=production`. The API rejects a non-HTTPS public URL
or a missing persistent JWKS in that mode.

Do not replace `REMENTUM_MASTER_KEY` on an existing instance. Rementum will lose access to every
wrapped brain key. Keep the original value with your disaster-recovery material.

## AI provider

| Variable | Purpose |
| --- | --- |
| `REMENTUM_LLM_BASE_URL` | API root that contains `/chat/completions` |
| `REMENTUM_LLM_MODEL` | Provider model identifier |
| `REMENTUM_LLM_API_KEY` | Provider credential; keyless local endpoints may leave it empty |
| `REMENTUM_LLM_REASONING_EFFORT` | Optional `none`, `minimal`, `low`, `medium`, or `high` request value |
| `REMENTUM_LLM_TIMEOUT_MS` | Summary request timeout |
| `REMENTUM_LLM_MAX_INPUT_CHARS` | Maximum staged body size sent for analysis |
| `REMENTUM_LLM_CONCURRENCY` | Maximum concurrent summary requests |

The API requires the provider because every staged write needs a routing summary and conflict check.
The provider receives the complete candidate article body in plaintext.

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
