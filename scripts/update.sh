#!/bin/sh
set -eu

root_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Usage: ./scripts/update.sh [--no-backup]' \
    '' \
    'Fetch the configured upstream branch and deploy the latest Rementum version.' \
    'A successful encrypted backup is required before the source is updated.' \
    '' \
    'Options:' \
    '  --no-backup  Update without creating a backup (not recommended).' \
    '  -h, --help   Show this help.'
}

create_backup=true
case "${1:-}" in
  "") ;;
  --no-backup) create_backup=false ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
[ "$#" -le 1 ] || fail "Only one option can be passed"

command -v git >/dev/null 2>&1 || fail "Git is required"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "Run this command from a Rementum Git checkout"
[ -f .env ] || fail "Missing .env. Run ./scripts/install.sh for a new instance"

if ! git diff --quiet -- || ! git diff --cached --quiet --; then
  fail "The checkout has tracked changes; commit or restore them before updating"
fi

branch=$(git symbolic-ref --quiet --short HEAD) \
  || fail "The checkout is detached; switch to the installed branch before updating"
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null) \
  || fail "Branch $branch has no upstream; configure one before updating"
before=$(git rev-parse HEAD)

printf 'Checking %s for updates...\n' "$upstream"
git fetch --prune
target=$(git rev-parse '@{upstream}')

if [ "$before" = "$target" ]; then
  printf 'Rementum is already up to date (%s).\n' "$(git rev-parse --short HEAD)"
  exit 0
fi

git merge-base --is-ancestor "$before" "$target" \
  || fail "The local branch and $upstream have diverged; update them manually"

command -v docker >/dev/null 2>&1 || fail "Docker is required"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
docker info >/dev/null 2>&1 || fail "The Docker daemon is not available"

if [ "$create_backup" = true ]; then
  backup_recipient=$(sed -n \
    's/^[[:space:]]*REMENTUM_BACKUP_AGE_RECIPIENT[[:space:]]*=[[:space:]]*//p' .env \
    | tail -n 1)
  case "$backup_recipient" in
    ""|"''"|'""')
      fail "Set REMENTUM_BACKUP_AGE_RECIPIENT in .env, or explicitly use --no-backup"
      ;;
  esac

  printf 'Creating an encrypted backup...\n'
  docker compose \
    -f docker-compose.yml \
    -f compose.production.yml \
    --profile backup run --rm backup
else
  printf 'Warning: continuing without a backup.\n' >&2
fi

printf 'Updating source from %s...\n' "$upstream"
git merge --ff-only "$upstream"

printf 'Building and deploying the update...\n'
if ! ./scripts/deploy.sh; then
  printf '%s\n' \
    'Error: deployment failed after the source update.' \
    'Inspect the service logs and use the encrypted backup if recovery is required.' >&2
  exit 1
fi

printf 'Updated Rementum from %s to %s.\n' \
  "$(git rev-parse --short "$before")" \
  "$(git rev-parse --short HEAD)"
