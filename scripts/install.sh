#!/bin/sh
set -eu

umask 077

root_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Usage: ./scripts/install.sh [--non-interactive]' \
    '' \
    'Configure and deploy a new production Rementum instance.' \
    'Without flags, the installer prompts for every value in a terminal.' \
    '' \
    'Non-interactive inputs:' \
    '  REMENTUM_INSTALL_DOMAIN                 required' \
    '  REMENTUM_INSTALL_OWNER_EMAIL            required' \
    '  REMENTUM_INSTALL_OWNER_NAME             default: Owner' \
    '  REMENTUM_INSTALL_OWNER_PASSWORD_FILE    required secret file' \
    '  REMENTUM_INSTALL_LLM_ENABLED             true or false; default: false' \
    '  REMENTUM_INSTALL_LLM_BASE_URL            required when LLM is true' \
    '  REMENTUM_INSTALL_LLM_MODEL               required when LLM is true' \
    '  REMENTUM_INSTALL_LLM_API_KEY_FILE        optional when LLM is true' \
    '  REMENTUM_INSTALL_ALLOW_SIGNUP            true or false; default: false' \
    '  REMENTUM_INSTALL_RESEND_API_KEY_FILE     required when signup is true' \
    '  REMENTUM_INSTALL_MAIL_FROM               required when signup is true' \
    '' \
    'The installer reads secrets from files to keep them out of arguments and logs.' \
    'The installer refuses to replace an existing .env file.'
}

non_interactive=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --non-interactive) non_interactive=true ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift
done

cleanup() {
  stty echo 2>/dev/null || true
}
trap cleanup EXIT INT TERM

prompt() {
  label=$1
  default=${2:-}
  if [ -n "$default" ]; then
    printf '%s [%s]: ' "$label" "$default" >&2
  else
    printf '%s: ' "$label" >&2
  fi
  IFS= read -r answer
  if [ -z "$answer" ]; then
    answer=$default
  fi
  printf '%s' "$answer"
}

prompt_secret() {
  label=$1
  printf '%s: ' "$label" >&2
  stty -echo
  IFS= read -r answer
  stty echo
  printf '\n' >&2
  printf '%s' "$answer"
}

read_secret_file() {
  label=$1
  path=$2
  required=$3
  if [ -z "$path" ]; then
    [ "$required" = false ] && return 0
    fail "$label file is required"
  fi
  [ -f "$path" ] || fail "$label file does not exist: $path"
  secret_value=""
  IFS= read -r secret_value < "$path" || [ -n "$secret_value" ] \
    || fail "$label file is empty: $path"
  printf '%s' "$secret_value"
  unset secret_value
}

reject_apostrophe() {
  label=$1
  value=$2
  case "$value" in
    *"'"*) fail "$label cannot contain an apostrophe" ;;
  esac
}

command -v docker >/dev/null 2>&1 || fail "Docker is required"
command -v openssl >/dev/null 2>&1 || fail "OpenSSL is required"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
docker info >/dev/null 2>&1 || fail "The Docker daemon is not available"
[ "$non_interactive" = true ] || [ -t 0 ] \
  || fail "Run this installer in a terminal or pass --non-interactive"
[ ! -e .env ] || fail ".env already exists; use ./scripts/update.sh to update this instance"

printf 'Rementum production setup\n\n'

if [ "$non_interactive" = true ]; then
  domain=${REMENTUM_INSTALL_DOMAIN:-}
  owner_email=${REMENTUM_INSTALL_OWNER_EMAIL:-}
  owner_name=${REMENTUM_INSTALL_OWNER_NAME:-Owner}
  llm_enabled=${REMENTUM_INSTALL_LLM_ENABLED:-false}
  llm_base_url=""
  llm_model=""
  llm_api_key=""
  if [ "$llm_enabled" = true ]; then
    llm_base_url=${REMENTUM_INSTALL_LLM_BASE_URL:-}
    llm_model=${REMENTUM_INSTALL_LLM_MODEL:-}
    llm_api_key=$(read_secret_file \
      "LLM API key" "${REMENTUM_INSTALL_LLM_API_KEY_FILE:-}" false)
  fi
  allow_signup=${REMENTUM_INSTALL_ALLOW_SIGNUP:-false}
  resend_api_key=""
  mail_from=""
  if [ "$allow_signup" = true ]; then
    resend_api_key=$(read_secret_file \
      "Resend API key" "${REMENTUM_INSTALL_RESEND_API_KEY_FILE:-}" true)
    mail_from=${REMENTUM_INSTALL_MAIL_FROM:-}
  fi
  turnstile_site_key=${REMENTUM_INSTALL_TURNSTILE_SITE_KEY:-}
  turnstile_secret_key=${REMENTUM_INSTALL_TURNSTILE_SECRET_KEY:-}
  owner_password=$(read_secret_file \
    "Owner password" "${REMENTUM_INSTALL_OWNER_PASSWORD_FILE:-}" true)
else
  domain=$(prompt "Public domain, without https://" "")
  owner_email=$(prompt "Owner email" "")
  owner_name=$(prompt "Owner display name" "Owner")
  llm_enabled=$(prompt "Configure an external LLM for optional workspace compaction? (yes/no)" "no")
  llm_base_url=""
  llm_model=""
  llm_api_key=""
  case "$llm_enabled" in
    yes|y)
      llm_enabled=true
      llm_base_url=$(prompt "OpenAI-compatible API base URL" "https://api.openai.com/v1")
      llm_model=$(prompt "Model name" "")
      llm_api_key=$(prompt_secret "API key (leave empty for a keyless local provider)")
      ;;
    no|n) llm_enabled=false ;;
    *) fail "Answer yes or no for external LLM article compaction" ;;
  esac
  allow_signup=$(prompt "Allow public account registration? (yes/no)" "no")
  case "$allow_signup" in
    yes|y) allow_signup=true ;;
    no|n) allow_signup=false ;;
    *) fail "Answer yes or no for public registration" ;;
  esac

  resend_api_key=""
  mail_from=""
  if [ "$allow_signup" = true ]; then
    resend_api_key=$(prompt_secret "Resend API key")
    [ -n "$resend_api_key" ] || fail "Public registration requires a Resend API key"
    mail_from=$(prompt "Verified sender, for example Rementum <rementum@example.com>" "")
    [ -n "$mail_from" ] || fail "Public registration requires a verified sender"
  fi

  turnstile_site_key=""
  turnstile_secret_key=""
  turnstile_enabled=$(prompt \
    "Protect sign-in and registration with Cloudflare Turnstile? (yes/no)" "no")
  case "$turnstile_enabled" in
    yes|y)
      turnstile_site_key=$(prompt "Turnstile site key from the Cloudflare dashboard" "")
      [ -n "$turnstile_site_key" ] || fail "Turnstile requires a site key"
      turnstile_secret_key=$(prompt_secret "Turnstile secret key")
      [ -n "$turnstile_secret_key" ] || fail "Turnstile requires a secret key"
      ;;
    no|n) ;;
    *) fail "Answer yes or no for Cloudflare Turnstile" ;;
  esac

  owner_password=$(prompt_secret "Owner password (12 characters minimum)")
  owner_password_again=$(prompt_secret "Repeat owner password")
  [ "$owner_password" = "$owner_password_again" ] || fail "The passwords do not match"
fi

case "$domain" in
  ""|*://*|*/*|*:*|*" "*) fail "Enter a hostname such as memory.example.com" ;;
esac
printf '%s' "$domain" \
  | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$' \
  || fail "Enter a valid fully qualified domain name"

printf '%s' "$owner_email" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' \
  || fail "Enter a valid owner email"
[ -n "$owner_name" ] || fail "Owner display name is required"

case "$llm_enabled" in
  true|false) ;;
  *) fail "REMENTUM_INSTALL_LLM_ENABLED must be true or false" ;;
esac

if [ "$llm_enabled" = true ]; then
  case "$llm_base_url" in
    http://*|https://*) ;;
    *) fail "The API base URL must start with http:// or https://" ;;
  esac
  [ -n "$llm_model" ] || fail "A model name is required"
fi

case "$allow_signup" in
  true|false) ;;
  *) fail "REMENTUM_INSTALL_ALLOW_SIGNUP must be true or false" ;;
esac

if [ "$allow_signup" = true ]; then
  [ -n "$resend_api_key" ] || fail "Public registration requires a Resend API key"
  [ -n "$mail_from" ] || fail "Public registration requires a verified sender"
fi

[ "${#owner_password}" -ge 12 ] || fail "The owner password must contain at least 12 characters"

reject_apostrophe "Domain" "$domain"
reject_apostrophe "Owner display name" "$owner_name"
reject_apostrophe "LLM base URL" "$llm_base_url"
reject_apostrophe "Model name" "$llm_model"
reject_apostrophe "LLM API key" "$llm_api_key"
reject_apostrophe "Resend API key" "$resend_api_key"
reject_apostrophe "Mail sender" "$mail_from"
reject_apostrophe "Turnstile site key" "$turnstile_site_key"
reject_apostrophe "Turnstile secret key" "$turnstile_secret_key"

if { [ -n "$turnstile_site_key" ] || [ -n "$turnstile_secret_key" ]; } \
  && { [ -z "$turnstile_site_key" ] || [ -z "$turnstile_secret_key" ]; }; then
  fail "Cloudflare Turnstile needs both a site key and a secret key"
fi

printf '\nGenerating instance secrets...\n'
postgres_password=$(openssl rand -hex 32)
postgres_super_password=$(openssl rand -hex 32)
master_key=$(openssl rand -base64 32)
cookie_keys="$(openssl rand -base64 32),$(openssl rand -base64 32)"
jwt_jwks=$(
  docker run --rm --network none -i \
    node:24-alpine node --input-type=module - \
    < deploy/setup/generate-jwks.mjs
)
case "$jwt_jwks" in
  '{"keys":['*) ;;
  *) fail "Could not generate the OAuth signing key" ;;
esac

cat > .env <<EOF
# Generated by scripts/install.sh. Keep this file private and escrow REMENTUM_MASTER_KEY.
NODE_ENV='production'
REMENTUM_PUBLIC_URL='https://$domain'
REMENTUM_DATABASE_URL='postgres://owl_app:$postgres_password@postgres:5432/owl'
REMENTUM_DATABASE_ADMIN_URL='postgres://postgres:$postgres_super_password@postgres:5432/owl'
REMENTUM_POSTGRES_PASSWORD='$postgres_password'
REMENTUM_POSTGRES_SUPER_PASSWORD='$postgres_super_password'
REMENTUM_POSTGRES_PORT='55432'

REMENTUM_MASTER_KEY='$master_key'
REMENTUM_COOKIE_KEYS='$cookie_keys'
REMENTUM_JWT_JWKS='$jwt_jwks'

REMENTUM_BLOB_DIR='/data/blobs'
REMENTUM_EXPORT_DIR='/data/exports'
REMENTUM_ALLOW_SIGNUP='$allow_signup'
REMENTUM_DEV_AUTH='false'
REMENTUM_LOG_LEVEL='info'
REMENTUM_EMBEDDINGS_URL='http://embeddings:8790'
REMENTUM_EMBEDDING_MODEL='intfloat/multilingual-e5-small'

REMENTUM_LLM_ENABLED='$llm_enabled'
REMENTUM_LLM_BASE_URL='$llm_base_url'
REMENTUM_LLM_MODEL='$llm_model'
REMENTUM_LLM_API_KEY='$llm_api_key'
REMENTUM_LLM_REASONING_EFFORT=''
REMENTUM_LLM_TIMEOUT_MS='45000'
REMENTUM_LLM_MAX_INPUT_CHARS='24000'
REMENTUM_LLM_CONCURRENCY='4'
REMENTUM_COMPACTION_POLL_MS='2000'

REMENTUM_RESEND_API_KEY='$resend_api_key'
REMENTUM_MAIL_FROM='$mail_from'

REMENTUM_TURNSTILE_SITE_KEY='$turnstile_site_key'
REMENTUM_TURNSTILE_SECRET_KEY='$turnstile_secret_key'

REMENTUM_BACKUP_HOST_DIR='./backups'
REMENTUM_BACKUP_AGE_RECIPIENT=''
REMENTUM_DOMAIN='$domain'
EOF
chmod 600 .env
mkdir -p backups
chmod 700 backups

unset owner_password_again llm_api_key resend_api_key turnstile_secret_key

printf 'Building and starting Rementum...\n'
./scripts/deploy.sh

printf 'Creating the first owner...\n'
printf '%s\n' "$owner_password" \
  | docker compose \
    -f docker-compose.yml \
    -f compose.production.yml \
    run --rm --no-deps -T \
    api node apps/api/dist/admin.js -- create-owner \
    --email "$owner_email" \
    --name "$owner_name" \
    --password-file /dev/stdin
unset owner_password

printf '\nRementum is running at https://%s\n' "$domain"
printf 'Store .env in an encrypted secrets manager before adding knowledge.\n'
