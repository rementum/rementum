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

| Variable | Purpose |
| --- | --- |
| `REMENTUM_LLM_ENABLED` | Set to `true` to use an external OpenAI-compatible provider; defaults to `false` |
| `REMENTUM_LLM_BASE_URL` | API root that contains `/chat/completions` |
| `REMENTUM_LLM_MODEL` | Provider model identifier |
| `REMENTUM_LLM_API_KEY` | Provider credential; leave empty for a keyless local endpoint |
| `REMENTUM_LLM_REASONING_EFFORT` | Optional `none`, `minimal`, `low`, `medium`, or `high` |
| `REMENTUM_LLM_TIMEOUT_MS` | Generation request timeout |
| `REMENTUM_LLM_MAX_INPUT_CHARS` | Maximum source characters per generation chunk |
| `REMENTUM_LLM_CONCURRENCY` | Maximum concurrent generation requests |
| `REMENTUM_COMPACTION_POLL_MS` | Worker delay between queue polls; defaults to 2 seconds |

With the default `REMENTUM_LLM_ENABLED=false`, Rementum keeps the submitted title and body and
derives a one-sentence routing summary inside the instance. It makes no external LLM request, and
staging, conflict checks, routing, and search all keep working.

Setting `REMENTUM_LLM_ENABLED=true` with a base URL and model only makes deferred compaction
*available*. It sends nothing on its own: every workspace starts with compaction off, and an owner or
admin has to turn it on from the team page.

Here is what compaction does once a workspace enables it:

- Staging never calls the provider.
- On promotion, Rementum stores the submitted version encrypted and queues it for the worker.
- The worker sends the title and body to the provider **in plaintext**. The provider must support
  strict JSON Schema through the Chat Completions `response_format` field.
- The provider returns a title of at most 120 characters, a one-sentence summary of at most 300
  characters, and a Markdown body of at most 8,000 characters. That length is a ceiling. Compaction
  keeps the measured values and does not shorten a source that already fits. The body must keep
  wiki-style `[[slug]]` links so articles stay reachable.
- A successful job stores the compact result as the article's next version, encrypted like any
  other edit. The submitted version stays in the article's history, so a poor result can be
  reviewed against it and the article re-edited.
- Jobs retry after 1 and 5 minutes. After the third failure the submitted body stays canonical and
  you can retry the article by hand. While compaction stays on, the worker's maintenance pass also
  requeues an article that has been failed for at least an hour.

Enabling a workspace affects future promoted versions only. Use **Compact existing** to queue the
current version of existing articles; it does not touch history. Turning compaction off cancels
queued jobs. A request already sent to the provider cannot be recalled, but the worker discards its
result once it sees the workspace is off.

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

The Compose file creates named volumes for PostgreSQL, blobs, Caddy state, and the embedding model
cache. `REMENTUM_BACKUP_HOST_DIR` is a host bind mount, so you can move encrypted archives off the
server.
