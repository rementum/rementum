#!/bin/sh
set -eu

root_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$root_dir/.env"
backup_file="$root_dir/.env.pre-rementum"

[ -f "$env_file" ] || exit 0
grep -q '^OWL_[A-Z0-9_]*=' "$env_file" || exit 0

if grep -q '^REMENTUM_[A-Z0-9_]*=' "$env_file"; then
  printf '%s\n' \
    'Error: .env mixes legacy and Rementum variable names; resolve the duplicate values first.' >&2
  exit 1
fi

if [ -e "$backup_file" ]; then
  printf 'Error: %s already exists; preserve or remove it before retrying.\n' "$backup_file" >&2
  exit 1
fi

umask 077
temporary=$(mktemp "$root_dir/.env.rementum.XXXXXX")
cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT INT TERM

sed 's/^OWL_/REMENTUM_/' "$env_file" > "$temporary"
chmod 600 "$temporary"
cp -p "$env_file" "$backup_file"
chmod 600 "$backup_file"
mv "$temporary" "$env_file"
trap - EXIT INT TERM

printf 'Migrated .env variable names. The previous file is at %s.\n' "$backup_file"
