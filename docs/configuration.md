# Configuration

Rementum reads its settings from `.env` through Docker Compose. The installer writes the production
values for you. Start from `.env.example` only when you set things up by hand.

## Public endpoint and authentication

| Variable | Purpose |
| --- | --- |
| `REMENTUM_DOMAIN` | Caddy hostname, without a scheme or path |
| `REMENTUM_PUBLIC_URL` | Public HTTPS origin shared by the web app, session API, and MCP OAuth |
| `REMENTUM_MASTER_KEY` | Base64 32-byte key that wraps every brain data key |
| `REMENTUM_COOKIE_KEYS` | Comma-separated cookie signing keys |
| `REMENTUM_JWT_JWKS` | Private RSA JWKS used to sign OAuth tokens |
| `REMENTUM_ALLOW_SIGNUP` | Set to `true` to allow public registration |
| `REMENTUM_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key for the account forms; empty disables it |
| `REMENTUM_TURNSTILE_SECRET_KEY` | Turnstile secret used to verify challenge tokens server-side |
| `REMENTUM_DEV_AUTH` | Enables the dev identity header; rejected when `NODE_ENV=production` |
| `REMENTUM_TRUSTED_PROXIES` | Proxies whose `X-Forwarded-For` is trusted (IPs, CIDRs, or the `loopback`, `linklocal`, `uniquelocal` presets); empty when the API faces clients directly |

The production Compose override sets `NODE_ENV=production`. In that mode the API refuses to start with
a non-HTTPS public URL or a missing persistent JWKS.

Browser sign-in uses a 14-day, server-side session stored as a hashed opaque token. The web app does
not use OAuth. Workspace MCP OAuth reuses that web session to select the account and verifies its
workspace membership before it issues a grant.

### Bot protection

Rementum runs fine with no captcha. Set both Turnstile keys to add a human-verification challenge to
sign-in, registration, verification resend, and password reset:

```dotenv
REMENTUM_TURNSTILE_SITE_KEY='0x4AAAAAAA...'
REMENTUM_TURNSTILE_SECRET_KEY='0x4AAAAAAA...'
```

Set the keys together. The API refuses to start with only one. Rementum verifies each challenge
against Cloudflare before it checks a password, creates an account, or sends email, and it fails
closed when Cloudflare is unreachable. Tokens are single-use, so the sign-in form asks for a fresh
challenge after a failed attempt. Leave both keys empty to run without the widget.

MCP OAuth has no separate password form. A browser without a web session is sent through the same
Turnstile-protected sign-in page as the web app, then resumes the OAuth flow automatically. The first
grant for a client, workspace, or expanded scope set still requires an explicit approval.

!!! warning "Never change the master key"
    Do not replace `REMENTUM_MASTER_KEY` on an existing instance. Rementum would lose access to every
    wrapped brain key. Keep the original value with your disaster-recovery material.

## Article generation

Rementum stores each article's title, optional one-sentence summary, and body exactly as
submitted. Nothing is generated and there is no external model to configure: staging, conflict
checks, routing, and search all work without any request leaving the instance.

## Email

Set `REMENTUM_RESEND_API_KEY` and `REMENTUM_MAIL_FROM` together, or leave both empty when the
instance sends no registration, invitation, or password-reset email.

Public registration needs email delivery:

```dotenv
REMENTUM_ALLOW_SIGNUP='true'
REMENTUM_RESEND_API_KEY='re_...'
REMENTUM_MAIL_FROM='Rementum <rementum@example.com>'
```

## Storage and search

| Variable | Purpose |
| --- | --- |
| `REMENTUM_POSTGRES_PASSWORD` | Application database role password |
| `REMENTUM_POSTGRES_SUPER_PASSWORD` | Migration and backup database password; never handed to the API or worker containers |
| `REMENTUM_EMBEDDING_MODEL` | Model loaded by the embedding service |
| `REMENTUM_EMBEDDING_DTYPE` | Optional weight precision, such as `fp32` or `q8` |
| `REMENTUM_EMBEDDING_POOLING` | Optional pooling override (`cls` or `mean`) for unrecognized models |
| `REMENTUM_EMBEDDING_QUERY_PREFIX` | Optional query prefix for models trained with one |
| `REMENTUM_EMBEDDING_PASSAGE_PREFIX` | Optional passage prefix for models trained with one |
| `REMENTUM_BLOB_DIR` | Blob storage path inside the API and worker containers |
| `REMENTUM_EXPORT_DIR` | Export workspace inside the API and worker containers |
| `REMENTUM_BACKUP_HOST_DIR` | Host directory that receives encrypted backup archives |
| `REMENTUM_BACKUP_AGE_RECIPIENT` | Age recipient required by the backup command |

The default embedding model is `onnx-community/granite-embedding-97m-multilingual-r2-ONNX`, loaded
quantized. Pooling, prefixes, and precision follow the model family: granite uses CLS pooling with no
prefixes; e5 uses mean pooling with `query:`/`passage:` prefixes; anything unrecognized is treated
like e5 unless the override variables say otherwise. A replacement model must produce 384-dimensional
vectors.

Changing the model needs no migration. Every stored vector records the model that produced it, search
ranks only vectors from the active model, and the worker's hourly maintenance pass re-embeds anything
indexed under a different one. Until an article is re-embedded it is still found through metadata and
full-text search, so search quality recovers brain by brain over the next few passes.

A pooling or prefix override changes a model's vectors just like a model switch, so those overrides
become part of the stored identity (for example `acme/some-embedder#pooling=cls`) and trigger the
same automatic re-embed when they change. `REMENTUM_EMBEDDING_DTYPE` does not: precision only nudges
vectors within the same space, and an unsupported value is rejected at startup.

The embedding service embeds one text at a time and truncates each to 1,024 tokens, which keeps its
memory bounded: about 450 MB with the model loaded, and under 800 MB while it indexes. A 1,024-token
window holds roughly a whole 4,000-character English section; in denser text, such as Turkish or
Chinese, the end of a long section does not reach its vector.

The Compose file creates named volumes for PostgreSQL, blobs, Caddy state, and the embedding model
cache. `REMENTUM_BACKUP_HOST_DIR` is a host bind mount, so you can move encrypted archives off the
server.
