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

docker compose \
  -f docker-compose.yml \
  -f compose.production.yml \
  up -d --build --remove-orphans --wait --wait-timeout "$timeout"

docker compose -f docker-compose.yml -f compose.production.yml ps
