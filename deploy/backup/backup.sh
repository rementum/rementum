#!/bin/sh
set -eu

: "${REMENTUM_DATABASE_ADMIN_URL:?REMENTUM_DATABASE_ADMIN_URL is required}"
: "${REMENTUM_BLOB_DIR:?REMENTUM_BLOB_DIR is required}"
: "${REMENTUM_BACKUP_DIR:?REMENTUM_BACKUP_DIR is required}"
: "${REMENTUM_BACKUP_AGE_RECIPIENT:?REMENTUM_BACKUP_AGE_RECIPIENT is required; unencrypted backups are refused}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

pg_dump --format=custom --no-owner --no-acl "$REMENTUM_DATABASE_ADMIN_URL" > "$work/database.dump"
tar -C "$REMENTUM_BLOB_DIR" -cf "$work/blobs.tar" .
printf '{"format":"rementum-backup-v1","createdAt":"%s"}\n' "$stamp" > "$work/manifest.json"
mkdir -p "$REMENTUM_BACKUP_DIR"
tar -C "$work" -cf - database.dump blobs.tar manifest.json \
  | age -r "$REMENTUM_BACKUP_AGE_RECIPIENT" -o "$REMENTUM_BACKUP_DIR/rementum-$stamp.tar.age"
printf 'Created %s\n' "$REMENTUM_BACKUP_DIR/rementum-$stamp.tar.age"
