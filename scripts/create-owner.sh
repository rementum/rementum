#!/bin/sh
set -eu

root_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

usage() {
  printf '%s\n' \
    'Usage: ./scripts/create-owner.sh EMAIL [DISPLAY_NAME]' \
    '' \
    'Create the first system owner for a deployed Owl Memory instance.'
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  usage >&2
  exit 2
fi

[ -f .env ] || {
  printf 'Missing .env. Run ./scripts/install.sh first.\n' >&2
  exit 1
}
[ -t 0 ] || {
  printf 'Run this command in an interactive terminal.\n' >&2
  exit 1
}

email=$1
display_name=${2:-Owner}
printf '%s' "$email" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' || {
  printf 'Enter a valid owner email.\n' >&2
  exit 1
}

cleanup() {
  stty echo 2>/dev/null || true
}
trap cleanup EXIT INT TERM

printf 'Owner password (12 characters minimum): ' >&2
stty -echo
IFS= read -r password
stty echo
printf '\nRepeat owner password: ' >&2
stty -echo
IFS= read -r password_again
stty echo
printf '\n' >&2

[ "${#password}" -ge 12 ] || {
  printf 'The owner password must contain at least 12 characters.\n' >&2
  exit 1
}
[ "$password" = "$password_again" ] || {
  printf 'The passwords do not match.\n' >&2
  exit 1
}
unset password_again

printf '%s\n' "$password" \
  | docker compose \
    -f docker-compose.yml \
    -f compose.production.yml \
    run --rm --no-deps -T \
    api node apps/api/dist/admin.js -- create-owner \
    --email "$email" \
    --name "$display_name" \
    --password-file /dev/stdin
unset password
