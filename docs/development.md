# Development

New contributors should start with
[CONTRIBUTING.md](https://github.com/rementum/rementum/blob/main/CONTRIBUTING.md), which covers the
repository layout, commit conventions, and what a pull request is expected to pass. This page
covers the mechanics of running the stack.

## Requirements

- Node.js 24 or newer
- pnpm 10.30.2
- Docker Compose v2
- Python 3 for the documentation site

## Run the container stack

Copy the example environment and fill the required keys. The default configuration preserves staged
titles and bodies and uses local routing summaries. Configuring the optional AI provider only makes
deferred compaction available; an owner/admin must still enable it on each workspace:

```bash
cp .env.example .env
docker compose up -d --build --wait
```

Use `REMENTUM_PUBLIC_URL=http://localhost` and `REMENTUM_DOMAIN=localhost` for this path. The base Compose file
keeps the API in development mode, serves the app at `http://localhost`, and runs migrations before
the API and worker start.

## Run Node services on the host

Install dependencies and start PostgreSQL:

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
REMENTUM_DATABASE_ADMIN_URL=postgres://postgres:YOUR_ADMIN_PASSWORD@127.0.0.1:55432/owl pnpm db:migrate
pnpm dev
```

Set host-side database and embedding URLs in the shell when they differ from the container values in
`.env`. Use the container stack for end-to-end authentication testing because the web session API
and MCP OAuth endpoints share one public origin behind Caddy.

The public landing page at `/` is statically rendered and refreshes its public authentication
configuration at most once per minute. The session-dependent web application lives at `/dashboard`;
sign-in and workspace-selection flows return there by default.

## Checks

```bash
pnpm check
pnpm build
docker compose config --quiet
docker compose -f docker-compose.yml -f compose.production.yml config --quiet
```

`pnpm check` runs Biome, typechecks every package, and runs the test suite. `pnpm test:coverage`
adds a v8 coverage report and fails below the floor in `vitest.config.ts`.

Tests named `*.integration.test.ts` need PostgreSQL and skip themselves when
`REMENTUM_TEST_DATABASE_URL` is unset. Point that variable at a throwaway migrated database using
the unprivileged `owl_app` role, because those tests exercise row-level security:

```bash
REMENTUM_TEST_DATABASE_URL=postgres://owl_app:YOUR_APP_PASSWORD@127.0.0.1:55432/owl pnpm test:coverage
```

## Documentation

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r docs/requirements.txt
mkdocs serve
```

Run the release check with `mkdocs build --strict`.

The stack serves the built site at `/docs` from the `docs` service, whose image
(`deploy/docs/Dockerfile`) runs the same strict build. The public copy at
[rementum.dev/docs](https://rementum.dev/docs/) is that service on the hosted instance, so a
documentation change reaches it with the next deployment.
