#!/bin/sh
set -eu

root_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/rementum-install-test.XXXXXX")

cleanup() {
  rm -rf "$fixture"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'Test failed: %s\n' "$1" >&2
  exit 1
}

mkdir -p \
  "$fixture/scripts" \
  "$fixture/deploy/setup" \
  "$fixture/fake-bin" \
  "$fixture/log"
cp "$root_dir/scripts/install.sh" "$fixture/scripts/install.sh"
cp "$root_dir/deploy/setup/generate-jwks.mjs" "$fixture/deploy/setup/generate-jwks.mjs"

cat > "$fixture/scripts/deploy.sh" <<'EOF'
#!/bin/sh
set -eu
: > "$REMENTUM_INSTALL_TEST_LOG/deploy"
EOF

cat > "$fixture/fake-bin/docker" <<'EOF'
#!/bin/sh
set -eu
case "${1:-}" in
  info) exit 0 ;;
  run)
    printf '%s\n' '{"keys":[{"kty":"OKP"}]}'
    ;;
  compose)
    if [ "${2:-}" = version ]; then
      exit 0
    fi
    owner_password=""
    IFS= read -r owner_password || true
    printf '%s' "$owner_password" > "$REMENTUM_INSTALL_TEST_LOG/owner-password"
    ;;
  *)
    printf 'Unexpected docker invocation: %s\n' "$*" >&2
    exit 1
    ;;
esac
EOF

cat > "$fixture/fake-bin/openssl" <<'EOF'
#!/bin/sh
set -eu
case "$*" in
  'rand -hex 32') printf '%064d' 0 ;;
  'rand -base64 32') printf '%044d' 1 ;;
  *)
    printf 'Unexpected openssl invocation: %s\n' "$*" >&2
    exit 1
    ;;
esac
EOF

chmod +x \
  "$fixture/scripts/install.sh" \
  "$fixture/scripts/deploy.sh" \
  "$fixture/fake-bin/docker" \
  "$fixture/fake-bin/openssl"

"$fixture/scripts/install.sh" --help > "$fixture/help.txt"
grep -Fq -- '--non-interactive' "$fixture/help.txt" \
  || fail "help does not document non-interactive mode"
grep -Fq 'REMENTUM_INSTALL_LLM_ENABLED' "$fixture/help.txt" \
  || fail "help does not document optional LLM mode"

if PATH="$fixture/fake-bin:$PATH" \
  REMENTUM_INSTALL_TEST_LOG="$fixture/log" \
  REMENTUM_INSTALL_DOMAIN='memory.example.com' \
  REMENTUM_INSTALL_OWNER_EMAIL='owner@example.com' \
  REMENTUM_INSTALL_LLM_BASE_URL='https://llm.example.com/v1' \
  REMENTUM_INSTALL_LLM_MODEL='summary-model' \
  "$fixture/scripts/install.sh" --non-interactive \
  > "$fixture/missing.out" 2> "$fixture/missing.err"; then
  fail "missing owner password file was accepted"
fi
grep -Fq 'Owner password file is required' "$fixture/missing.err" \
  || fail "missing secret error is not actionable"
[ ! -e "$fixture/.env" ] || fail "failed validation created .env"

printf '%s\n' 'agent-owner-password' > "$fixture/owner-password"
printf '%s\n' 'agent-llm-key' > "$fixture/llm-api-key"
chmod 600 "$fixture/owner-password" "$fixture/llm-api-key"

if PATH="$fixture/fake-bin:$PATH" \
  REMENTUM_INSTALL_TEST_LOG="$fixture/log" \
  REMENTUM_INSTALL_DOMAIN='memory.example.com' \
  REMENTUM_INSTALL_OWNER_EMAIL='owner@example.com' \
  REMENTUM_INSTALL_OWNER_PASSWORD_FILE="$fixture/owner-password" \
  REMENTUM_INSTALL_LLM_BASE_URL='https://llm.example.com/v1' \
  REMENTUM_INSTALL_LLM_MODEL='summary-model' \
  REMENTUM_INSTALL_ALLOW_SIGNUP='true' \
  REMENTUM_INSTALL_MAIL_FROM='Rementum <rementum@example.com>' \
  "$fixture/scripts/install.sh" --non-interactive \
  > "$fixture/signup.out" 2> "$fixture/signup.err"; then
  fail "public signup without a Resend secret was accepted"
fi
grep -Fq 'Resend API key file is required' "$fixture/signup.err" \
  || fail "missing signup secret error is not actionable"
[ ! -e "$fixture/.env" ] || fail "failed signup validation created .env"

if PATH="$fixture/fake-bin:$PATH" \
REMENTUM_INSTALL_TEST_LOG="$fixture/log" \
REMENTUM_INSTALL_DOMAIN='memory.example.com' \
REMENTUM_INSTALL_OWNER_EMAIL='owner@example.com' \
REMENTUM_INSTALL_OWNER_PASSWORD_FILE="$fixture/owner-password" \
REMENTUM_INSTALL_TURNSTILE_SITE_KEY='0x4AAAAAAA-site' \
"$fixture/scripts/install.sh" --non-interactive \
  > "$fixture/turnstile.out" 2> "$fixture/turnstile.err"; then
  fail "a half-configured Turnstile pair was accepted"
fi
grep -Fq 'both a site key and a secret key' "$fixture/turnstile.err" \
  || fail "half-configured Turnstile error is not actionable"
[ ! -e "$fixture/.env" ] || fail "failed Turnstile validation created .env"

PATH="$fixture/fake-bin:$PATH" \
REMENTUM_INSTALL_TEST_LOG="$fixture/log" \
REMENTUM_INSTALL_DOMAIN='memory.example.com' \
REMENTUM_INSTALL_OWNER_EMAIL='owner@example.com' \
REMENTUM_INSTALL_OWNER_NAME='Agent Owner' \
REMENTUM_INSTALL_OWNER_PASSWORD_FILE="$fixture/owner-password" \
REMENTUM_INSTALL_LLM_ENABLED='true' \
REMENTUM_INSTALL_LLM_BASE_URL='https://llm.example.com/v1' \
REMENTUM_INSTALL_LLM_MODEL='summary-model' \
REMENTUM_INSTALL_LLM_API_KEY_FILE="$fixture/llm-api-key" \
REMENTUM_INSTALL_ALLOW_SIGNUP='false' \
REMENTUM_INSTALL_TURNSTILE_SITE_KEY='0x4AAAAAAA-site' \
REMENTUM_INSTALL_TURNSTILE_SECRET_KEY='0x4AAAAAAA-secret' \
"$fixture/scripts/install.sh" --non-interactive \
  > "$fixture/install.out" 2> "$fixture/install.err"

grep -Fq "REMENTUM_PUBLIC_URL='https://memory.example.com'" "$fixture/.env" \
  || fail "domain was not written"
grep -Fq "REMENTUM_LLM_MODEL='summary-model'" "$fixture/.env" \
  || fail "model was not written"
grep -Fq "REMENTUM_LLM_ENABLED='true'" "$fixture/.env" \
  || fail "external LLM mode was not enabled"
grep -Fq "REMENTUM_LLM_API_KEY='agent-llm-key'" "$fixture/.env" \
  || fail "API key file was not read"
grep -Fq "REMENTUM_ALLOW_SIGNUP='false'" "$fixture/.env" \
  || fail "safe signup default was not written"
grep -Fq "REMENTUM_TURNSTILE_SITE_KEY='0x4AAAAAAA-site'" "$fixture/.env" \
  || fail "turnstile site key was not written"
grep -Fq "REMENTUM_TURNSTILE_SECRET_KEY='0x4AAAAAAA-secret'" "$fixture/.env" \
  || fail "turnstile secret key was not written"
[ -f "$fixture/log/deploy" ] || fail "deployment was not called"
grep -Fxq 'agent-owner-password' "$fixture/log/owner-password" \
  || fail "owner password was not passed through standard input"

if grep -Fq 'agent-owner-password' "$fixture/install.out" "$fixture/install.err"; then
  fail "owner password leaked to installer output"
fi
if grep -Fq 'agent-llm-key' "$fixture/install.out" "$fixture/install.err"; then
  fail "LLM API key leaked to installer output"
fi
if grep -Fq '0x4AAAAAAA-secret' "$fixture/install.out" "$fixture/install.err"; then
  fail "Turnstile secret key leaked to installer output"
fi

env_mode=$(stat -c '%a' "$fixture/.env" 2>/dev/null || stat -f '%Lp' "$fixture/.env")
[ "$env_mode" = 600 ] || fail ".env mode is $env_mode instead of 600"

rm -f "$fixture/.env" "$fixture/log/deploy" "$fixture/log/owner-password"
rmdir "$fixture/backups"

PATH="$fixture/fake-bin:$PATH" \
REMENTUM_INSTALL_TEST_LOG="$fixture/log" \
REMENTUM_INSTALL_DOMAIN='local.example.com' \
REMENTUM_INSTALL_OWNER_EMAIL='owner@example.com' \
REMENTUM_INSTALL_OWNER_PASSWORD_FILE="$fixture/owner-password" \
"$fixture/scripts/install.sh" --non-interactive \
  > "$fixture/local.out" 2> "$fixture/local.err"

grep -Fq "REMENTUM_LLM_ENABLED='false'" "$fixture/.env" \
  || fail "local summary mode was not enabled by default"
grep -Fq "REMENTUM_LLM_BASE_URL=''" "$fixture/.env" \
  || fail "local summary mode retained an LLM base URL"
grep -Fq "REMENTUM_LLM_MODEL=''" "$fixture/.env" \
  || fail "local summary mode retained an LLM model"
grep -Fq "REMENTUM_LLM_API_KEY=''" "$fixture/.env" \
  || fail "local summary mode retained an LLM API key"
grep -Fq "REMENTUM_TURNSTILE_SITE_KEY=''" "$fixture/.env" \
  || fail "turnstile protection was not off by default"
grep -Fq "REMENTUM_TURNSTILE_SECRET_KEY=''" "$fixture/.env" \
  || fail "turnstile protection was not off by default"

printf 'Installer tests passed.\n'
