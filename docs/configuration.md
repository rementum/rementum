# Configuration

Owl Memory reads `.env` through Docker Compose. The installer writes production values. Start from
`.env.example` only when you manage setup by hand.

## Public endpoint and authentication

| Variable | Purpose |
| --- | --- |
| `OWL_DOMAIN` | Caddy hostname without a scheme or path |
| `OWL_PUBLIC_URL` | Public HTTPS origin used by OAuth, REST metadata, and MCP |
| `OWL_MASTER_KEY` | Base64-encoded 32-byte key that wraps every brain data key |
| `OWL_COOKIE_KEYS` | Comma-separated cookie signing keys |
| `OWL_JWT_JWKS` | Private RSA JWKS used to sign OAuth tokens |
| `OWL_ALLOW_SIGNUP` | Enables public registration when set to `true` |
| `OWL_DEV_AUTH` | Enables the development identity header; keep `false` in production |

The production Compose override sets `NODE_ENV=production`. The API rejects a non-HTTPS public URL
or a missing persistent JWKS in that mode.

Do not replace `OWL_MASTER_KEY` on an existing instance. Owl Memory will lose access to every wrapped
brain key. Keep the original value with your disaster-recovery material.

## AI provider

| Variable | Purpose |
| --- | --- |
| `OWL_LLM_BASE_URL` | API root that contains `/chat/completions` |
| `OWL_LLM_MODEL` | Provider model identifier |
| `OWL_LLM_API_KEY` | Provider credential; keyless local endpoints may leave it empty |
| `OWL_LLM_REASONING_EFFORT` | Optional `none`, `minimal`, `low`, `medium`, or `high` request value |
| `OWL_LLM_TIMEOUT_MS` | Summary request timeout |
| `OWL_LLM_MAX_INPUT_CHARS` | Maximum staged body size sent for analysis |
| `OWL_LLM_CONCURRENCY` | Maximum concurrent summary requests |

The API requires the provider because every staged write needs a routing summary and conflict check.
The provider receives the complete candidate article body in plaintext.

## Email

Set `OWL_RESEND_API_KEY` and `OWL_MAIL_FROM` together. Leave both empty when the instance does not
send registration, invitation, or password-reset email.

Public registration requires email delivery:

```dotenv
OWL_ALLOW_SIGNUP='true'
OWL_RESEND_API_KEY='re_...'
OWL_MAIL_FROM='Owl Memory <owl@example.com>'
```

## Storage and search

| Variable | Purpose |
| --- | --- |
| `OWL_POSTGRES_PASSWORD` | Application database role password |
| `OWL_POSTGRES_SUPER_PASSWORD` | Migration and backup database password |
| `OWL_EMBEDDING_MODEL` | Model loaded by the embedding service |
| `OWL_BLOB_DIR` | Blob storage path inside API and worker containers |
| `OWL_EXPORT_DIR` | Export workspace inside API and worker containers |
| `OWL_BACKUP_HOST_DIR` | Host directory that receives encrypted backup archives |
| `OWL_BACKUP_AGE_RECIPIENT` | Age recipient required by the backup command |

The Compose file creates named volumes for PostgreSQL, blobs, Caddy state, and the embedding model
cache. `OWL_BACKUP_HOST_DIR` uses a host bind mount so you can move encrypted archives off the server.
