#!/usr/bin/env bash
# Server installer (.ai/specs/2026-10-14-instalator.md, docs/adr/0003-instalator-na-serwer.md).
# Needs only Docker with Compose >= 2.24 and bash. Works on the repository it lives in, from
# any current directory. Steps K1-K9 print one status line each; messages are in Polish.
# Never prints secret values and never enables `set -x`.
set -euo pipefail
umask 077
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
. "$ROOT_DIR/scripts/lib/env.sh"

ENV_FILE="$ROOT_DIR/.env"
PROJECT="${MP_INSTALL_PROJECT:-mounjaro-przepisy}"
REQUIRED_COMPOSE_MAJOR=2
REQUIRED_COMPOSE_MINOR=24
# Used by the question steps K3-K5 (stage 2.2).
# shellcheck disable=SC2034
INTERACTIVE=0
if [ -t 0 ]; then INTERACTIVE=1; fi

trap env_cleanup_tmp EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

STEP_NAMES=(
  [1]='Wymagania' [2]='Plik .env' [3]='Wariant HTTPS' [4]='Hasło bazy'
  [5]='Wartości od właściciela' [6]='Klucze push' [7]='Kontrola .env' [8]='Start' [9]='Sprawdzenie'
)

# step_status <n> <zrobione|pominięty, już zrobione>
step_status() {
  printf 'K%s %s: %s\n' "$1" "${STEP_NAMES[$1]}" "$2"
}

# step_fail <n> <detail line>...: status line on stdout, details on stderr, exit 1.
step_fail() {
  local n="$1"
  shift
  printf 'K%s %s: błąd\n' "$n" "${STEP_NAMES[$n]}"
  local line
  for line in "$@"; do
    printf '%s\n' "$line" >&2
  done
  exit 1
}

# Runs Compose in a cleaned environment: only .env and the listed variables reach it, so the
# caller's shell cannot override values from .env (ADR 0003). The only place that calls it.
compose() {
  local -a passthrough=()
  local name
  for name in PATH HOME USER LANG TERM XDG_RUNTIME_DIR DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG \
    DOCKER_CERT_PATH DOCKER_TLS_VERIFY DOCKER_BUILDKIT; do
    if [ -n "${!name:-}" ]; then
      passthrough+=("$name=${!name}")
    fi
  done
  local -a files=(-f "$ROOT_DIR/compose.yml")
  if [ -n "${MP_INSTALL_COMPOSE_OVERRIDE:-}" ]; then
    files+=(-f "$MP_INSTALL_COMPOSE_OVERRIDE")
  fi
  env -i "${passthrough[@]}" \
    docker compose -p "$PROJECT" --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" \
    "${files[@]}" "$@"
}

step_k1() {
  local info version numbers major minor
  if ! command -v docker >/dev/null 2>&1; then
    step_fail 1 '  - Brakuje Dockera (polecenie docker nie istnieje). Zainstaluj Docker Engine z wtyczką Compose.'
  fi
  if ! info="$(docker info 2>&1 >/dev/null)"; then
    if [[ "$info" == *[Pp]ermission\ denied* ]]; then
      step_fail 1 "  - Brak dostępu do Dockera dla użytkownika ${USER:-$(id -un)}. Dodaj go do grupy docker i zaloguj się ponownie."
    fi
    step_fail 1 '  - Docker nie odpowiada. Sprawdź, czy usługa docker działa.'
  fi
  version="$(docker compose version --short 2>/dev/null || true)"
  numbers="${version#v}"
  numbers="${numbers%%-*}"
  if [[ "$numbers" =~ ^([0-9]+)\.([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    if [ "$major" -gt "$REQUIRED_COMPOSE_MAJOR" ] \
      || { [ "$major" -eq "$REQUIRED_COMPOSE_MAJOR" ] && [ "$minor" -ge "$REQUIRED_COMPOSE_MINOR" ]; }; then
      step_status 1 'zrobione'
      return
    fi
  fi
  step_fail 1 "  - Wymagany Docker Compose w wersji co najmniej ${REQUIRED_COMPOSE_MAJOR}.${REQUIRED_COMPOSE_MINOR}, wykryto: ${version:-brak}."
}

step_k2() {
  local mode
  if [ ! -f "$ENV_FILE" ]; then
    env_copy_file "$ROOT_DIR/.env.example" "$ENV_FILE"
    step_status 2 'zrobione'
    return
  fi
  mode="$(stat -c %a "$ENV_FILE")"
  if (( (8#$mode) & 8#177 )); then
    chmod 600 "$ENV_FILE"
  fi
  step_status 2 'pominięty, już zrobione'
}

step_k7() {
  local -a lines=()
  local line name text
  env_parse "$ENV_FILE"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    name="${line%%$'\t'*}"
    text="${line#*$'\t'}"
    lines+=("  - ${name}: ${text}")
  done < <(env_problems)
  if [ "${#lines[@]}" -gt 0 ]; then
    lines+=('  Popraw wartości w .env i uruchom instalator ponownie.')
    step_fail 7 "${lines[@]}"
  fi
  step_status 7 'zrobione'
}

main() {
  if [ "$#" -gt 0 ]; then
    echo 'Użycie: scripts/install.sh (bez argumentów)' >&2
    exit 1
  fi
  step_k1
  step_k2
  # K3-K6 arrive in stage 2.2.
  step_k7
  # K8-K9 arrive in stage 2.3, which removes this message.
  echo 'Instalator nie jest jeszcze kompletny.' >&2
  exit 1
}

main "$@"
