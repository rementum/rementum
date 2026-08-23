#!/bin/sh
set -eu

: "${OWL_DATABASE_ADMIN_URL:?OWL_DATABASE_ADMIN_URL is required}"
: "${OWL_BLOB_DIR:?OWL_BLOB_DIR is required}"
: "${OWL_BACKUP_AGE_IDENTITY_FILE:?OWL_BACKUP_AGE_IDENTITY_FILE is required}"

archive=${1:?Usage: restore.sh BACKUP.tar.age}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

age -d -i "$OWL_BACKUP_AGE_IDENTITY_FILE" "$archive" | tar -C "$work" -xf -
test -f "$work/manifest.json"
test -f "$work/database.dump"
test -f "$work/blobs.tar"

pg_restore --clean --if-exists --no-owner --no-acl --dbname "$OWL_DATABASE_ADMIN_URL" "$work/database.dump"
mkdir -p "$OWL_BLOB_DIR"
tar -C "$OWL_BLOB_DIR" -xf "$work/blobs.tar"
printf 'Restore completed. Run migrations, then rebuild embeddings.\n'
