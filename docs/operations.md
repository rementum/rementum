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

## Create an encrypted backup

Install `age` on an administrator workstation and create an identity:

```bash
age-keygen -o owl-memory-backup.agekey
age-keygen -y owl-memory-backup.agekey
```

Store the printed public recipient in `.env`:

```dotenv
OWL_BACKUP_AGE_RECIPIENT='age1...'
```

Create the archive:

```bash
docker compose \
  -f docker-compose.yml \
  -f compose.production.yml \
  --profile backup run --rm backup
```

The command writes `owl-memory-<UTC timestamp>.tar.age` under `OWL_BACKUP_HOST_DIR`. Move the archive
to storage outside the Owl Memory host. Store `.env`, or at least `OWL_MASTER_KEY`, in a separate
encrypted secrets system.

## Upgrade

Create a backup, then update the source and deploy:

```bash
git pull --ff-only
./scripts/deploy.sh
```

The deployment command rebuilds the images, runs pending migrations, replaces changed services, and
waits for their health checks. Owl Memory uses forward-only database migrations. Read the release
notes before you upgrade across several releases.

## Restore

Restore into an empty instance or accept that `pg_restore --clean` will replace the current database
objects. Create a fresh backup before you continue.

Place the encrypted archive in `OWL_BACKUP_HOST_DIR`, then stop services that write data:

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
  -v /absolute/path/owl-memory-backup.agekey:/run/secrets/age-identity:ro \
  restore /backups/owl-memory-20260825T120000Z.tar.age
```

Start the stack and apply migrations:

```bash
./scripts/deploy.sh
curl --fail https://memory.example.com/healthz
```

The database dump contains the vector index. The worker fills embeddings for articles that lack an
index row after services start.
