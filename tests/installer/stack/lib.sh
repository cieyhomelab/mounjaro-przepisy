#!/usr/bin/env bash
# Helpers for installer scenarios on a real Docker stack. Sourced by tests/installer/stack/*.sh,
# which scripts/test-installer.sh runs one by one. Each scenario gets:
#   INSTALL_DIR                  a fresh copy of the repository (the installer works on it)
#   MP_INSTALL_PROJECT           its own Compose project, inst-<run id>-<scenario>
#   MP_INSTALL_COMPOSE_OVERRIDE  tests/installer/compose.installer-test.yml (no fixed host ports)
# The runner removes the project (with volumes and images) and the copy afterwards.
set -euo pipefail

: "${INSTALL_DIR:?run scenarios through scripts/test-installer.sh}"
: "${MP_INSTALL_PROJECT:?run scenarios through scripts/test-installer.sh}"
: "${MP_INSTALL_COMPOSE_OVERRIDE:?run scenarios through scripts/test-installer.sh}"
export MP_INSTALL_PROJECT MP_INSTALL_COMPOSE_OVERRIDE

INSTALL_OUT="$(mktemp)"
trap 'rm -f "$INSTALL_OUT"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "ok: $*"
}

assert_eq() {
  [ "$1" = "$2" ] || fail "$3 (expected '$2', got '$1')"
}

# assert_output_contains <text> <message>: the last installer output contains the text.
assert_output_contains() {
  grep -qF -- "$1" "$INSTALL_OUT" || fail "$2"
}

# assert_output_lacks <text> <message>: the last installer output does not contain the text.
assert_output_lacks() {
  if grep -qF -- "$1" "$INSTALL_OUT"; then fail "$2"; fi
}

# Compose on the test project, with the same files and .env the installer uses.
stack_compose() {
  local env_file=()
  [ -f "$INSTALL_DIR/.env" ] && env_file=(--env-file "$INSTALL_DIR/.env")
  docker compose -p "$MP_INSTALL_PROJECT" --project-directory "$INSTALL_DIR" "${env_file[@]}" \
    -f "$INSTALL_DIR/compose.yml" -f "$MP_INSTALL_COMPOSE_OVERRIDE" "$@"
}

# run_installer [VAR=value ...]: runs scripts/install.sh without a terminal and with only the
# given variables added to the environment. Output goes to $INSTALL_OUT; returns its exit code.
run_installer() {
  local code=0
  env -i PATH="$PATH" HOME="$HOME" \
    MP_INSTALL_PROJECT="$MP_INSTALL_PROJECT" MP_INSTALL_COMPOSE_OVERRIDE="$MP_INSTALL_COMPOSE_OVERRIDE" \
    ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} "$@" \
    bash "$INSTALL_DIR/scripts/install.sh" </dev/null >"$INSTALL_OUT" 2>&1 || code=$?
  return "$code"
}

# env_value <KEY>: the last value of KEY in .env, without surrounding quotes.
env_value() {
  local line value=''
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*$1=(.*)$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value#[\"\']}"
      value="${value%[\"\']}"
    fi
  done <"$INSTALL_DIR/.env"
  printf '%s' "$value"
}

env_checksum() {
  sha256sum "$INSTALL_DIR/.env" | cut -d' ' -f1
}

# Fake but well-formed values for the questions the installer cannot answer itself; scenarios pass
# them as run_installer "${TEST_VALUES[@]}" HTTPS_MODE=caddy.
# shellcheck disable=SC2034
TEST_VALUES=(
  APP_DOMAIN=przepisy.example.test
  ALLOWED_EMAIL=owner@example.test
  GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-test-only-secret
  BACKUP_AGE_RECIPIENT=age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
)
