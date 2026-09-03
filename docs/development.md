# Development

Start with
[CONTRIBUTING.md](https://github.com/rementum/rementum/blob/main/CONTRIBUTING.md). It covers the
repository layout, commit conventions, and what a pull request must pass. This page covers running the
stack.

## Requirements

- Node.js 24 or newer
- pnpm 10.30.2
- Docker Compose v2
- Python 3 for the documentation site

## Run the whole stack in containers

Copy the example environment and fill the required keys. The default config keeps staged titles and
bodies and uses local routing summaries; configuring the optional AI provider only makes deferred
compaction available, and an owner or admin still has to enable it per workspace:

```bash
cp .env.example .env
docker compose up -d --build --wait
```

Use `REMENTUM_PUBLIC_URL=http://localhost` and `REMENTUM_DOMAIN=localhost` for this path. The base
Compose file keeps the API in development mode, serves the app at `http://localhost`, and runs
migrations before the API and worker start.

## Run Node services on the host

Install dependencies and start PostgreSQL:

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
REMENTUM_DATABASE_ADMIN_URL=postgres://postgres:YOUR_ADMIN_PASSWORD@127.0.0.1:55432/owl pnpm db:migrate
pnpm dev
```

Set host-side database and embedding URLs in the shell when they differ from the container values in
`.env`. Use the container stack for end-to-end authentication testing, because the web session API and
the MCP OAuth endpoints share one public origin behind Caddy.

The public landing page at `/` is statically rendered and refreshes its public auth config at most
once a minute. The signed-in web app lives at `/dashboard`; sign-in and workspace selection return
there by default.

## Checks

```bash
pnpm check
pnpm build
docker compose config --quiet
docker compose -f docker-compose.yml -f compose.production.yml config --quiet
```

`pnpm check` runs Biome, typechecks every package, and runs the tests. `pnpm test:coverage` adds a v8
coverage report and fails below the floor in `vitest.config.ts`.

Tests named `*.integration.test.ts` need PostgreSQL and skip themselves when
`REMENTUM_TEST_DATABASE_URL` is unset. Point that variable at a throwaway migrated database using the
unprivileged `owl_app` role, because those tests exercise row-level security:

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

### llms.txt

`/llms.txt` and `/llms-full.txt` are generated from these Markdown pages by the web app: re-read on
every request under `next dev`, rendered once during `next build`. A container stack serves the copy
captured when the `web` image was built, so rebuild that image after editing `docs/`.
