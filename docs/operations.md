# Backups and upgrades

## Check status and logs

```bash
docker compose -f docker-compose.yml -f compose.production.yml ps
docker compose -f docker-compose.yml -f compose.production.yml logs -f api web worker
```

The public probes are:

- `/healthz` checks PostgreSQL and the embedding service.
- `/readyz` checks PostgreSQL.
- `/metrics` exposes the current build information metric.

The embedding container turns healthy only once its model is loaded, and the first start downloads
roughly 465 MB into the `model_cache` volume. A failing probe after that is real; ask the container
for the reason:

```bash
docker compose -f docker-compose.yml -f compose.production.yml exec embeddings \
  wget -qO- --content-on-error http://127.0.0.1:8790/healthz
```

(`--content-on-error` matters: the reason arrives in the body of a 503, which wget otherwise
discards.)

If the reason is `Model cache /models is not writable`, the `model_cache` volume predates the
image that seeds its ownership — Docker only applies that to an empty volume, so a volume created
root-owned stays root-owned across upgrades. Fix it once and restart:

```bash
docker compose -f docker-compose.yml -f compose.production.yml \
  run --rm --user root embeddings chown -R rementum:rementum /models
docker compose -f docker-compose.yml -f compose.production.yml up -d embeddings
```

Until the model loads, the API answers `semanticSearch: false` and search falls back to metadata and
full-text ranking.

## Create an encrypted backup

Install `age` on an administrator workstation and create an identity:

```bash
age-keygen -o rementum-backup.agekey
age-keygen -y rementum-backup.agekey
```

Store the printed public recipient in `.env`:

```dotenv
REMENTUM_BACKUP_AGE_RECIPIENT='age1...'
```

Create the archive:

```bash
docker compose \
  -f docker-compose.yml \
  -f compose.production.yml \
  --profile backup run --rm backup
```

The command writes `rementum-<UTC timestamp>.tar.age` under `REMENTUM_BACKUP_HOST_DIR`. Move the
archive to storage outside the Rementum host. Store `.env`, or at least `REMENTUM_MASTER_KEY`, in a
separate encrypted secrets system.

## Upgrade

Set `REMENTUM_BACKUP_AGE_RECIPIENT` as described above, then update the instance with one command:

```bash
./scripts/update.sh
```

The updater:

1. Refuses to overwrite tracked local changes or a diverged branch.
2. Fetches the branch's configured upstream and exits without rebuilding when it is already current.
3. Creates an encrypted backup before changing the source.
4. Fast-forwards the source, rebuilds the images, runs pending migrations, replaces changed
   services, and waits for their health checks.

The first Rementum deployment also migrates legacy environment-variable names in `.env`. It keeps
the previous file as `.env.pre-rementum`; move that secrets-bearing backup into your encrypted
secrets system after verifying the deployment.

Rementum uses forward-only database migrations. Read the release notes before upgrading across
several releases. If you have made your own source changes, update and deploy that checkout manually
instead of bypassing the updater's clean-tree check.

In an emergency, you can explicitly skip the backup:

```bash
./scripts/update.sh --no-backup
```

This is not recommended. If deployment fails after the source is updated, inspect the service logs
and restore the encrypted backup when recovery is required.

## Restore

Restore into an empty instance or accept that `pg_restore --clean` will replace the current database
objects. Create a fresh backup before you continue.

Place the encrypted archive in `REMENTUM_BACKUP_HOST_DIR`, then stop services that write data:

```bash
docker compose -f docker-compose.yml -f compose.production.yml stop caddy web api worker
docker compose -f docker-compose.yml -f compose.production.yml up -d postgres
```

Mount the age identity and run the restore service:

```bash
docker compose \
  -f docker-compose.yml \
  -f compose.production.yml \
  --profile restore run --rm \
  -v /absolute/path/rementum-backup.agekey:/run/secrets/age-identity:ro \
  restore /backups/rementum-20260825T120000Z.tar.age
```

Start the stack and apply migrations:

```bash
./scripts/deploy.sh
curl --fail https://memory.example.com/healthz
```

The database dump contains the vector index. The worker fills embeddings for articles that lack an
index row after services start.
