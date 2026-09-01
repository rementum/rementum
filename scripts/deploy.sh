#!/bin/sh
set -eu

root_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

if [ ! -f .env ]; then
  printf 'Missing .env. Run ./scripts/install.sh for a new instance.\n' >&2
  exit 1
fi

./scripts/migrate-env.sh

timeout=${REMENTUM_DEPLOY_TIMEOUT:-600}

compose() {
  docker compose -f docker-compose.yml -f compose.production.yml "$@"
}

# One image at a time: `up --build` runs five Node builds in parallel, which needs more
# memory than a small host has left while the current stack keeps its share, and lets
# api and migrate race each other for the same layers instead of reusing them. The
# running stack keeps serving until every new image exists; only then does `up` swap
# containers. migrate follows api so its identical build is a pure cache hit.
for service in api migrate worker web embeddings docs; do
  compose build "$service"
done

compose up -d --remove-orphans --wait --wait-timeout "$timeout"

compose ps
