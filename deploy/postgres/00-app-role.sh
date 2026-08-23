#!/bin/sh
set -eu

: "${OWL_POSTGRES_PASSWORD:?OWL_POSTGRES_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$OWL_POSTGRES_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE owl_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'owl_app')\gexec
ALTER ROLE owl_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
SQL
