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
| `REMENTUM_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key shown on the account forms; empty disables bot protection |
| `REMENTUM_TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret used to verify challenge tokens server-side |
| `REMENTUM_DEV_AUTH` | Enables the development identity header; rejected when `NODE_ENV=production` |
| `REMENTUM_TRUSTED_PROXIES` | Reverse proxies whose `X-Forwarded-For` entries are trusted, as IPs, CIDRs, or the `loopback`, `linklocal`, and `uniquelocal` presets; empty when the API is exposed directly |

The production Compose override sets `NODE_ENV=production`. The API rejects a non-HTTPS public URL
or a missing persistent JWKS in that mode.

Browser sign-in uses a 14-day, server-side session stored as a hashed opaque token. OAuth is not
used for the web app; it is exposed only for workspace MCP connections.

### Bot protection

Rementum is self-hosted and works without any captcha service. Setting both Cloudflare Turnstile
keys adds a human-verification challenge to sign-in, registration, verification resend, and
password reset:

```dotenv
REMENTUM_TURNSTILE_SITE_KEY='0x4AAAAAAA...'
REMENTUM_TURNSTILE_SECRET_KEY='0x4AAAAAAA...'
```

The keys must be configured together; the API refuses to start with only one. Challenge tokens are
verified server-side against Cloudflare before any credential check, account creation, or email
send, and verification fails closed when Cloudflare cannot be reached. Tokens are single-use, so
the sign-in form requests a fresh challenge after every failed attempt. Leave both keys empty to
run without the widget.

The MCP OAuth consent sign-in (`/oauth/interaction/.../login`) is not challenge-protected — its
strict no-script page cannot load the widget — and relies on its request rate limit instead.

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
one-sentence summary of at most 300 characters, and a Markdown body of at most 8,000 characters.
That body length is a ceiling, not a target: compaction must keep measured values and should not
shorten a source that already fits. The compact body must keep wiki-style `[[slug]]` links so
articles stay reachable from each other. A successful job overwrites the same encrypted version,
removing the submitted body. Jobs retry after
1 and 5 minutes; after the third failure the submitted body remains canonical and the article can be
retried manually. The worker's maintenance pass also requeues failed articles automatically once
they have been failed for at least an hour, for as long as workspace compaction stays enabled.

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
| `REMENTUM_POSTGRES_SUPER_PASSWORD` | Migration and backup database password; never handed to the API or worker containers |
| `REMENTUM_EMBEDDING_MODEL` | Model loaded by the embedding service |
| `REMENTUM_EMBEDDING_DTYPE` | Optional weight precision override, such as `fp32` or `q8` |
| `REMENTUM_EMBEDDING_POOLING` | Optional pooling override (`cls` or `mean`) for unrecognized models |
| `REMENTUM_EMBEDDING_QUERY_PREFIX` | Optional query prefix for models trained with one |
| `REMENTUM_EMBEDDING_PASSAGE_PREFIX` | Optional passage prefix for models trained with one |
| `REMENTUM_BLOB_DIR` | Blob storage path inside API and worker containers |
| `REMENTUM_EXPORT_DIR` | Export workspace inside API and worker containers |
| `REMENTUM_BACKUP_HOST_DIR` | Host directory that receives encrypted backup archives |
| `REMENTUM_BACKUP_AGE_RECIPIENT` | Age recipient required by the backup command |

The default embedding model is `onnx-community/granite-embedding-97m-multilingual-r2-ONNX`,
loaded quantized. Pooling, text prefixes, and precision follow the model family: granite models
use CLS pooling with no prefixes, e5 models use mean pooling with `query:`/`passage:` prefixes,
and anything unrecognized is treated like e5 unless the override variables say otherwise. Any
replacement model must produce 384-dimensional vectors.

Changing the model needs no migration. Every stored vector is stamped with the model that produced
it, search ranks only vectors from the active model, and the worker's hourly maintenance pass
re-embeds each article it finds indexed under anything else. Until an article is re-embedded it is
still found through metadata and full-text search, so search quality recovers brain by brain over
the passes that follow a switch.

Overriding pooling or a prefix changes the vectors a model produces just as a model switch would,
so those overrides become part of the stored identity (for example
`acme/some-embedder#pooling=cls`) and trigger the same automatic re-embed when they change.
`REMENTUM_EMBEDDING_DTYPE` does not: precision only perturbs vectors inside the same space, and an
unsupported value is rejected at startup.

The Compose file creates named volumes for PostgreSQL, blobs, Caddy state, and the embedding model
cache. `REMENTUM_BACKUP_HOST_DIR` uses a host bind mount so you can move encrypted archives off the
server.
