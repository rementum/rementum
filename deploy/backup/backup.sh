#!/bin/sh
set -eu

: "${OWL_DATABASE_ADMIN_URL:?OWL_DATABASE_ADMIN_URL is required}"
: "${OWL_BLOB_DIR:?OWL_BLOB_DIR is required}"
: "${OWL_BACKUP_DIR:?OWL_BACKUP_DIR is required}"
: "${OWL_BACKUP_AGE_RECIPIENT:?OWL_BACKUP_AGE_RECIPIENT is required; unencrypted backups are refused}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

pg_dump --format=custom --no-owner --no-acl "$OWL_DATABASE_ADMIN_URL" > "$work/database.dump"
tar -C "$OWL_BLOB_DIR" -cf "$work/blobs.tar" .
printf '{"format":"owl-memory-backup-v1","createdAt":"%s"}\n' "$stamp" > "$work/manifest.json"
mkdir -p "$OWL_BACKUP_DIR"
tar -C "$work" -cf - database.dump blobs.tar manifest.json \
  | age -r "$OWL_BACKUP_AGE_RECIPIENT" -o "$OWL_BACKUP_DIR/owl-memory-$stamp.tar.age"
printf 'Created %s\n' "$OWL_BACKUP_DIR/owl-memory-$stamp.tar.age"
