# Contributing

Thanks for helping build Rementum. By contributing you agree that your contribution is licensed
under AGPL-3.0-only.

## Ways to contribute

- Report a bug or request a feature through [GitHub issues](https://github.com/yibudak/rementum/issues).
- Improve the documentation under `docs/`.
- Send a pull request for a bug fix or a feature.

Report security vulnerabilities privately instead of opening an issue. See [SECURITY.md](SECURITY.md).

## Prerequisites

- Node.js 24 or newer
- pnpm 10.30.2 (`corepack enable` picks up the version pinned in `package.json`)
- Docker Compose v2, for PostgreSQL and the reference stack
- Python 3, only to build the documentation site

## Set up

```bash
git clone https://github.com/yibudak/rementum.git
cd rementum
pnpm install --frozen-lockfile
cp .env.example .env
```

Fill in `REMENTUM_MASTER_KEY` and `REMENTUM_COOKIE_KEYS` with `openssl rand -base64 32`, and
generate `REMENTUM_JWT_JWKS` with `pnpm auth:jwks`. For a local stack, set
`REMENTUM_PUBLIC_URL=http://localhost` and `REMENTUM_DOMAIN=localhost`.

Run everything in containers:

```bash
docker compose up -d --build --wait
```

Or run the Node services on the host against a containerised database:

```bash
docker compose up -d postgres
REMENTUM_DATABASE_ADMIN_URL=postgres://postgres:YOUR_ADMIN_PASSWORD@127.0.0.1:55432/owl pnpm db:migrate
pnpm dev
```

[docs/development.md](docs/development.md) covers both paths in more detail.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/api` | Fastify REST API, OAuth provider, and the MCP endpoint |
| `apps/web` | Next.js app |
| `apps/worker` | Background compaction worker |
| `apps/embeddings` | Local embedding service |
| `packages/contracts` | Zod schemas shared by the API, MCP tools, and the web app |
| `packages/core` | Domain service, encryption, imports, and search ranking |
| `packages/db` | PostgreSQL store, auth repository, schema, and migrations |
| `docs/` | MkDocs documentation site |
| `deploy/`, `scripts/` | Reference deployment and installer scripts |

## Checks

Run the full check before you push. It covers what CI checks, in one command:

```bash
pnpm check   # biome check (format + lint), typecheck, tests
pnpm build
```

Individual steps:

```bash
pnpm format        # rewrite formatting
pnpm lint          # lint only
pnpm typecheck     # every package
pnpm test          # vitest, once
pnpm test:watch    # vitest, watching
pnpm test:coverage # vitest with a v8 coverage report
```

Tests live next to the code they cover as `*.test.ts`. `pnpm test:coverage` fails when coverage
drops below the floor set in `vitest.config.ts`. The floor follows the suite that ran: it is lower
without a database, because the integration tests skip themselves.

### Integration tests

Files named `*.integration.test.ts` need a PostgreSQL database with pgvector and skip themselves
when `REMENTUM_TEST_DATABASE_URL` is unset. To run them locally:

```bash
docker compose up -d postgres
REMENTUM_DATABASE_ADMIN_URL=postgres://postgres:YOUR_ADMIN_PASSWORD@127.0.0.1:55432/owl pnpm db:migrate
REMENTUM_TEST_DATABASE_URL=postgres://owl_app:YOUR_APP_PASSWORD@127.0.0.1:55432/owl pnpm test
```

They exercise row-level security, so the URL must use the unprivileged `owl_app` role rather than
the superuser. They write to whatever database you point them at, so use a throwaway one.

### Documentation

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r docs/requirements.txt
mkdocs serve
```

CI runs `mkdocs build --strict`, which fails on a broken link.

## Conventions

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) with a package
  scope: `fix(api): stop trusting the whole X-Forwarded-For chain`. Common scopes are `api`, `web`,
  `core`, `db`, `contracts`, `worker`, `docs`, and `deps`.
- Keep a commit to one change. A pull request may contain several.
- Formatting and linting are Biome's job, not a reviewer's. Do not hand-format.
- Add tests for behaviour changes.
- Migrations in `packages/db/migrations` are forward-only. Add a new numbered file; never edit a
  released one.
- Never add real customer knowledge, access tokens, or encryption keys to fixtures.
- Document user-visible changes under `docs/` in the same pull request.

## Pull requests

1. Branch from `main`.
2. Make the change with tests.
3. Run `pnpm check` and `pnpm build`.
4. Open the pull request and fill in the template. Explain what changed and how you verified it.
5. CI must be green before review.
