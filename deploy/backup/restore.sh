#!/bin/sh
set -eu

: "${REMENTUM_DATABASE_ADMIN_URL:?REMENTUM_DATABASE_ADMIN_URL is required}"
: "${REMENTUM_BLOB_DIR:?REMENTUM_BLOB_DIR is required}"
: "${REMENTUM_BACKUP_AGE_IDENTITY_FILE:?REMENTUM_BACKUP_AGE_IDENTITY_FILE is required}"

archive=${1:?Usage: restore.sh BACKUP.tar.age}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

age -d -i "$REMENTUM_BACKUP_AGE_IDENTITY_FILE" "$archive" | tar -C "$work" -xf -
test -f "$work/manifest.json"
test -f "$work/database.dump"
test -f "$work/blobs.tar"

pg_restore --clean --if-exists --no-owner --no-acl --dbname "$REMENTUM_DATABASE_ADMIN_URL" "$work/database.dump"
mkdir -p "$REMENTUM_BLOB_DIR"
tar -C "$REMENTUM_BLOB_DIR" -xf "$work/blobs.tar"
printf 'Restore completed. Run the deployment command to apply pending migrations.\n'
