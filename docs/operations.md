# Backups and upgrades

## Check status and logs

```bash
docker compose -f docker-compose.yml -f compose.production.yml ps
docker compose -f docker-compose.yml -f compose.production.yml logs -f api web worker
```

Caddy's access log redacts email verification, password reset, and invitation tokens from the
logged URL, so it can be shipped to a log system without carrying account-creating secrets.

The public probes are:

- `/healthz` checks PostgreSQL and the embedding service.
- `/readyz` checks PostgreSQL.
- `/metrics` exposes the build-information metric.

The embedding container goes healthy only after its model loads, and the first start downloads about
465 MB into the `model_cache` volume. A probe that fails after that is a real problem. Ask the
container why:

```bash
docker compose -f docker-compose.yml -f compose.production.yml exec embeddings \
  wget -qO- --content-on-error http://127.0.0.1:8790/healthz
```

(`--content-on-error` matters: the reason comes back in the body of a 503, which wget would otherwise
throw away.)

If the reason is `Model cache /models is not writable`, the `model_cache` volume predates the image
that seeds its ownership. Docker only seeds ownership on an empty volume, so a volume that was created
root-owned stays root-owned across upgrades. Fix it once and restart:

```bash
docker compose -f docker-compose.yml -f compose.production.yml \
  run --rm --user root embeddings chown -R rementum:rementum /models
docker compose -f docker-compose.yml -f compose.production.yml up -d embeddings
```

Until the model loads, the API reports `semanticSearch: false` and search falls back to metadata and
full-text ranking. After an upgrade that changes the embedding model, the worker re-embeds the old
articles one batch per hourly maintenance pass; they stay searchable through metadata and full-text
ranking until their turn.

## Create an encrypted backup

Install `age` on an admin workstation and create an identity:

```bash
age-keygen -o rementum-backup.agekey
age-keygen -y rementum-backup.agekey
```

Put the printed public recipient in `.env`:

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

This writes `rementum-<UTC timestamp>.tar.age` under `REMENTUM_BACKUP_HOST_DIR`. Move it to storage
off the Rementum host. Keep `.env`, or at least `REMENTUM_MASTER_KEY`, in a separate encrypted
secrets system.

The dump keeps the database grants for the application role, so an archive restores into an empty
instance as a database the API can use. Archives created before this behaviour restore without
those grants; after restoring one, run each migration's `GRANT` statements again or migrate a fresh
database and restore over it.

## Upgrade

Set `REMENTUM_BACKUP_AGE_RECIPIENT` first (see above), then upgrade with one command:

```bash
./scripts/update.sh
```

The updater:

1. Refuses to overwrite tracked local changes or a diverged branch.
2. Fetches the branch's upstream and exits without rebuilding when it is already current.
3. Creates an encrypted backup before it changes the source.
4. Fast-forwards the source, rebuilds the images, runs pending migrations, replaces changed services,
   and waits for their health checks.

A config-only change does not get past the "already up to date" exit. That includes editing `.env`
without a new release, such as switching the embedding model. Deploy it with:

```bash
./scripts/update.sh --redeploy
```

This still backs up first, then rebuilds and redeploys; Compose recreates only the containers whose
configuration actually changed.

The first Rementum deployment also migrates legacy environment-variable names in `.env`. It keeps the
old file as `.env.pre-rementum`; move that secrets-bearing backup into your encrypted secrets system
once the deployment checks out.

Migrations are forward-only. Read the release notes before you jump several releases. If you carry
your own source changes, update and deploy that checkout by hand instead of bypassing the updater's
clean-tree check.

In an emergency you can skip the backup:

```bash
./scripts/update.sh --no-backup
```

This is not recommended. If deployment fails after the source is updated, read the service logs and
restore the encrypted backup if you need to recover.

### Memory during a deployment

Deployments build images one at a time and only then replace containers, so the running stack keeps
serving and no build competes with four others for memory. The web build is also capped at a 2 GB
Node heap. This fits a 4 GB host with the stack running; add a little swap as a margin if the host has
none:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Restore

Restore into an empty instance, or accept that `pg_restore --clean` will replace the current database
objects. Create a fresh backup before you continue.

Put the encrypted archive in `REMENTUM_BACKUP_HOST_DIR`, then stop the services that write data:

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

The API and worker containers are started without the PostgreSQL superuser credentials; only the
`migrate`, `backup`, and `restore` services receive them. `./scripts/create-owner.sh` therefore
runs the owner command through the `migrate` service.

The dump contains the vector index. After services start, the worker fills embeddings for any article
that lacks an index row.
