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

# --- K3-K6: values in .env -----------------------------------------------------------------
# Source order for every key: non-empty value in .env, then the environment variable of the same
# name, then a computed value or a question (only with a terminal). A value already in .env is
# never validated or replaced here (K7 reports it). A key present more than once is left alone.

# reload: re-reads .env before each decision.
reload() {
  env_parse "$ENV_FILE"
}

# settled <KEY>: true when the key needs nothing from the installer (set, or duplicated).
settled() {
  [ -n "$(env_value "$1")" ] || [ "${ENV_COUNTS[$1]:-0}" -gt 1 ]
}

# ask <KEY> <prompt> <secret 0|1> [preface]: asks until the answer is valid, then stores it in
# ANSWER. End of input stops the installer without writing anything.
ask() {
  local key="$1" prompt="$2" secret="$3" preface="${4:-}" problem
  [ -z "$preface" ] || printf '%s\n' "$preface" >&2
  while true; do
    if [ "$secret" -eq 1 ]; then
      if ! IFS= read -rs -p "$prompt" ANSWER; then
        echo >&2
        ask_aborted "$key"
      fi
      echo >&2
    else
      IFS= read -r -p "$prompt" ANSWER || ask_aborted "$key"
    fi
    ANSWER="${ANSWER#"${ANSWER%%[![:space:]]*}"}"
    ANSWER="${ANSWER%"${ANSWER##*[![:space:]]}"}"
    if problem="$(env_value_problem "$key" "$ANSWER")"; then
      printf '  ! %s: %s\n' "$key" "$problem" >&2
      continue
    fi
    return
  done
}

ask_aborted() {
  printf 'Przerwano wpisywanie, %s nie została zapisana.\n' "$1" >&2
  exit 1
}

# store <KEY> <value>: writes one value to .env right away and re-reads the file.
store() {
  env_write_value "$ENV_FILE" "$1" "$2"
  reload
}

step_k3() {
  local candidate problem preface
  reload
  if settled HTTPS_MODE; then
    step_status 3 'pominięty, już zrobione'
    return
  fi
  candidate="${HTTPS_MODE:-}"
  if [ -n "$candidate" ]; then
    if problem="$(env_value_problem HTTPS_MODE "$candidate")"; then
      if [ "$INTERACTIVE" -eq 0 ]; then
        step_fail 3 "  - HTTPS_MODE: ${problem} (zmienna środowiskowa)"
      fi
      printf '  ! HTTPS_MODE: %s (zmienna środowiskowa)\n' "$problem" >&2
      candidate=''
    fi
  fi
  if [ -z "$candidate" ]; then
    if [ "$INTERACTIVE" -eq 0 ]; then
      step_fail 3 '  - HTTPS_MODE: brakuje wariantu HTTPS. Podaj go w .env albo w zmiennej HTTPS_MODE (caddy albo proxy).'
    fi
    APP_PORT_VALUE="$(env_value APP_PORT)"
    APP_PORT_VALUE="${APP_PORT_VALUE:-3000}"
    preface="caddy – wbudowana usługa caddy wystawia aplikację po HTTPS i sama odnawia certyfikat (porty 80 i 443). proxy – serwer ma własne reverse proxy, aplikacja nasłuchuje na 127.0.0.1:${APP_PORT_VALUE}."
    ask HTTPS_MODE 'Wariant HTTPS [caddy/proxy]: ' 0 "$preface"
    candidate="$ANSWER"
  fi
  store HTTPS_MODE "$candidate"
  step_status 3 'zrobione'
}

step_k4() {
  local candidate problem
  reload
  if settled POSTGRES_PASSWORD; then
    step_status 4 'pominięty, już zrobione'
    return
  fi
  candidate="${POSTGRES_PASSWORD:-}"
  if [ -n "$candidate" ]; then
    if problem="$(env_value_problem POSTGRES_PASSWORD "$candidate")"; then
      step_fail 4 "  - POSTGRES_PASSWORD: ${problem} (zmienna środowiskowa)"
    fi
  else
    if docker volume inspect "${PROJECT}_db-data" >/dev/null 2>&1; then
      step_fail 4 '  - Baza danych tej instalacji już istnieje i ma hasło, którego nie ma w .env. Wpisz dotychczasowe hasło do POSTGRES_PASSWORD w .env (albo podaj je w zmiennej POSTGRES_PASSWORD) i uruchom instalator ponownie.'
    fi
    candidate="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  fi
  store POSTGRES_PASSWORD "$candidate"
  step_status 4 'zrobione'
}

# k5_resolve <KEY> <prompt> <secret> [preface]: fills one empty key from the environment or a
# question. With no terminal a missing or wrong value is collected in K5_ERRORS.
k5_resolve() {
  local key="$1" prompt="$2" secret="$3" preface="${4:-}" candidate problem
  settled "$key" && return 0
  candidate="${!key:-}"
  if [ -n "$candidate" ]; then
    if problem="$(env_value_problem "$key" "$candidate")"; then
      if [ "$INTERACTIVE" -eq 0 ]; then
        K5_ERRORS+=("  - ${key}: ${problem} (zmienna środowiskowa)")
        return 0
      fi
      printf '  ! %s: %s (zmienna środowiskowa)\n' "$key" "$problem" >&2
      candidate=''
    fi
  fi
  if [ -z "$candidate" ]; then
    if [ "$INTERACTIVE" -eq 0 ]; then
      K5_ERRORS+=("  - ${key}: brak wartości. Wpisz ją w .env albo podaj w zmiennej ${key}.")
      return 0
    fi
    ask "$key" "$prompt" "$secret" "$preface"
    candidate="$ANSWER"
  fi
  store "$key" "$candidate"
  K5_DID=1
}

step_k5() {
  local candidate problem base derived domain_ok=1
  K5_ERRORS=()
  K5_DID=0
  reload

  # Domain: APP_DOMAIN, or computed from APP_BASE_URL (.env first, then the variable).
  if ! settled APP_DOMAIN; then
    candidate="${APP_DOMAIN:-}"
    if [ -n "$candidate" ] && problem="$(env_value_problem APP_DOMAIN "$candidate")"; then
      if [ "$INTERACTIVE" -eq 0 ]; then
        K5_ERRORS+=("  - APP_DOMAIN: ${problem} (zmienna środowiskowa)")
        domain_ok=0
        candidate=''
      else
        printf '  ! APP_DOMAIN: %s (zmienna środowiskowa)\n' "$problem" >&2
        candidate=''
      fi
    fi
    if [ -z "$candidate" ] && [ "$domain_ok" -eq 1 ]; then
      base="$(env_value APP_BASE_URL)"
      if [ -z "$base" ]; then base="${APP_BASE_URL:-}"; fi
      derived=''
      if [ -n "$base" ]; then derived="$(env_domain_from_url "$base")"; fi
      if [ -n "$derived" ] && ! env_value_problem APP_DOMAIN "$derived" >/dev/null; then
        candidate="$derived"
      fi
    fi
    if [ -n "$candidate" ]; then
      store APP_DOMAIN "$candidate"
      K5_DID=1
    elif [ "$domain_ok" -eq 1 ]; then
      if [ "$INTERACTIVE" -eq 0 ]; then
        K5_ERRORS+=('  - APP_DOMAIN: brak wartości. Wpisz ją w .env albo podaj w zmiennej APP_DOMAIN (albo APP_BASE_URL).')
      else
        ask APP_DOMAIN 'Domena aplikacji (np. przepisy.example.pl): ' 0
        store APP_DOMAIN "$ANSWER"
        K5_DID=1
      fi
    fi
  fi

  # Address: APP_BASE_URL, or https://<APP_DOMAIN>.
  if ! settled APP_BASE_URL; then
    candidate="${APP_BASE_URL:-}"
    if [ -n "$candidate" ] && problem="$(env_value_problem APP_BASE_URL "$candidate")"; then
      if [ "$INTERACTIVE" -eq 0 ]; then
        K5_ERRORS+=("  - APP_BASE_URL: ${problem} (zmienna środowiskowa)")
        candidate=''
        domain_ok=0
      else
        printf '  ! APP_BASE_URL: %s (zmienna środowiskowa)\n' "$problem" >&2
        candidate=''
      fi
    fi
    if [ -z "$candidate" ] && [ "$domain_ok" -eq 1 ] && [ -n "$(env_value APP_DOMAIN)" ]; then
      candidate="$(env_url_from_domain "$(env_value APP_DOMAIN)")"
    fi
    if [ -n "$candidate" ]; then
      store APP_BASE_URL "$candidate"
      K5_DID=1
    fi
  fi

  k5_resolve ALLOWED_EMAIL 'Adres Google, który może się logować: ' 0
  k5_resolve GOOGLE_CLIENT_ID 'Google Client ID: ' 0 \
    'Dane klienta OAuth z Google Cloud Console (docs/operations.md, „Klient OAuth w Google”).'
  k5_resolve GOOGLE_CLIENT_SECRET 'Google Client secret (nie będzie widoczny): ' 1
  k5_resolve BACKUP_AGE_RECIPIENT 'Klucz publiczny age: ' 0 \
    'Na własnym komputerze wygeneruj parę kluczy: age-keygen -o klucz-kopii.txt. Klucz prywatny zostaje u Ciebie, poza serwerem. Wklej klucz publiczny (age1…).'

  if [ "${#K5_ERRORS[@]}" -gt 0 ]; then
    step_fail 5 "${K5_ERRORS[@]}"
  fi
  if [ "$K5_DID" -eq 1 ]; then
    step_status 5 'zrobione'
  else
    step_status 5 'pominięty, już zrobione'
  fi
}

# Script for the one-off container that makes a VAPID pair: public key (65 bytes, base64url)
# on the first line, private key (32 bytes, base64url) on the second.
VAPID_SCRIPT='const c=require("node:crypto");const k=c.generateKeyPairSync("ec",{namedCurve:"prime256v1"});const p=k.publicKey.export({format:"jwk"});const d=k.privateKey.export({format:"jwk"}).d;const b=(s)=>Buffer.from(s,"base64url");console.log(Buffer.concat([Buffer.from([4]),b(p.x),b(p.y)]).toString("base64url"));console.log(d);'

node_image() {
  local image
  image="$(sed -n 's/^ARG NODE_IMAGE=//p' "$ROOT_DIR/Dockerfile" | head -n 1)"
  printf '%s' "${image:-node:24-bookworm-slim}"
}

step_k6() {
  local pub priv out problem
  reload
  # A duplicated key is left for K7 to report: filling its pair would mix two key pairs.
  if { settled VAPID_PUBLIC_KEY && settled VAPID_PRIVATE_KEY; } \
    || [ "${ENV_COUNTS[VAPID_PUBLIC_KEY]:-0}" -gt 1 ] || [ "${ENV_COUNTS[VAPID_PRIVATE_KEY]:-0}" -gt 1 ]; then
    step_status 6 'pominięty, już zrobione'
    return
  fi
  if [ -n "$(env_value VAPID_PUBLIC_KEY)" ]; then
    step_fail 6 '  - VAPID_PRIVATE_KEY: brak wartości przy ustawionym VAPID_PUBLIC_KEY. Uzupełnij ręcznie albo wyczyść oba klucze.'
  fi
  if [ -n "$(env_value VAPID_PRIVATE_KEY)" ]; then
    step_fail 6 '  - VAPID_PUBLIC_KEY: brak wartości przy ustawionym VAPID_PRIVATE_KEY. Uzupełnij ręcznie albo wyczyść oba klucze.'
  fi
  pub="${VAPID_PUBLIC_KEY:-}"
  priv="${VAPID_PRIVATE_KEY:-}"
  if [ -n "$pub" ] || [ -n "$priv" ]; then
    if [ -z "$pub" ]; then
      step_fail 6 '  - VAPID_PUBLIC_KEY: brak wartości przy podanym VAPID_PRIVATE_KEY. Podaj obie zmienne albo żadnej.'
    fi
    if [ -z "$priv" ]; then
      step_fail 6 '  - VAPID_PRIVATE_KEY: brak wartości przy podanym VAPID_PUBLIC_KEY. Podaj obie zmienne albo żadnej.'
    fi
    if problem="$(env_value_problem VAPID_PUBLIC_KEY "$pub")"; then
      step_fail 6 "  - VAPID_PUBLIC_KEY: ${problem} (zmienna środowiskowa)"
    fi
    if problem="$(env_value_problem VAPID_PRIVATE_KEY "$priv")"; then
      step_fail 6 "  - VAPID_PRIVATE_KEY: ${problem} (zmienna środowiskowa)"
    fi
  else
    if ! out="$(docker run --rm --network none "$(node_image)" node -e "$VAPID_SCRIPT" 2>/dev/null)"; then
      step_fail 6 '  - Nie udało się wygenerować kluczy push (docker run). Sprawdź, czy Docker może uruchomić obraz Node, i uruchom instalator ponownie.'
    fi
    pub="$(printf '%s\n' "$out" | sed -n 1p)"
    priv="$(printf '%s\n' "$out" | sed -n 2p)"
    if [ "${#pub}" -ne 87 ] || [ "${#priv}" -ne 43 ]; then
      step_fail 6 '  - Wygenerowane klucze push mają nieoczekiwaną długość. Uruchom instalator ponownie.'
    fi
  fi
  env_write_values "$ENV_FILE" VAPID_PUBLIC_KEY "$pub" VAPID_PRIVATE_KEY "$priv"
  step_status 6 'zrobione'
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

# --- K8-K9: start and health check --------------------------------------------------------

HEALTH_SCRIPT="fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(b=>process.exit(b.status==='ok'?0:1)).catch(()=>process.exit(1))"

# compose_logged <log file> <compose args>...: Compose output goes to the screen and to the file;
# returns Compose's exit code.
compose_logged() {
  local log="$1" code=0
  shift
  set +e
  compose "$@" 2>&1 | tee -a "$log"
  code="${PIPESTATUS[0]}"
  set -e
  return "$code"
}

step_k8() {
  local log mode port detail
  reload
  mode="$(env_value HTTPS_MODE)"
  port="$(env_value APP_PORT)"
  port="${port:-3000}"
  log="$(mktemp)"
  ENV_TMP_FILES+=("$log")
  if [ "$mode" = proxy ]; then
    if ! compose_logged "$log" --profile tls rm -sf caddy; then
      step_fail 8 '  - Uruchomienie nie powiodło się. Usuń przyczynę i uruchom instalator ponownie.'
    fi
  fi
  local -a up=(up -d --build --remove-orphans)
  if [ "$mode" = caddy ]; then
    up=(--profile tls "${up[@]}")
  fi
  if ! compose_logged "$log" "${up[@]}"; then
    if grep -qiE 'port is already allocated|address already in use' "$log"; then
      detail="  - Port APP_PORT (${port}) jest zajęty przez inny program. Zmień APP_PORT w .env albo zwolnij port."
      if [ "$mode" = caddy ]; then
        detail="  - Port APP_PORT (${port}) jest zajęty przez inny program. Zmień APP_PORT w .env, zwolnij port albo porty 80/443."
      fi
      step_fail 8 "$detail"
    fi
    step_fail 8 '  - Uruchomienie nie powiodło się. Usuń przyczynę i uruchom instalator ponownie.'
  fi
  rm -f "$log"
  step_status 8 'zrobione'
}

# now: whole seconds; a function so the tests can move the clock together with `sleep`.
now() {
  date +%s
}

step_k9() {
  local limit="${MP_INSTALL_HEALTH_TIMEOUT:-180}" started waited
  [[ "$limit" =~ ^[0-9]+$ ]] || limit=180
  started="$(now)"
  while true; do
    if compose exec -T app node -e "$HEALTH_SCRIPT" >/dev/null 2>&1; then
      step_status 9 'zrobione'
      return
    fi
    if [ $(($(now) - started)) -ge "$limit" ]; then
      break
    fi
    sleep 2
  done
  if [ "$limit" -eq 180 ]; then
    waited='3 minutach'
  else
    waited="${limit} s"
  fi
  step_fail 9 "  - Aplikacja nie odpowiada po ${waited}." \
    "  - Logi aplikacji: docker compose --project-directory ${ROOT_DIR} -p ${PROJECT} logs --tail 100 app"
}

print_reminder() {
  local base
  reload
  base="$(env_value APP_BASE_URL)"
  echo
  echo 'Aplikacja działa. Zostały kroki ręczne:'
  echo "  1. W Google Cloud Console dodaj adres powrotu OAuth: ${base}/api/auth/google/callback"
  echo '  2. Serwer powinien mieć zaszyfrowany dysk.'
  echo '  3. Klucz prywatny age (do kopii zapasowych) trzymaj poza serwerem.'
  if [ "$(env_value HTTPS_MODE)" = caddy ]; then
    echo "  4. Ustaw rekord DNS domeny $(env_value APP_DOMAIN) na adres tego serwera i otwórz porty 80 i 443."
    echo '  5. Przejdź listę kontrolną odbioru w docs/operations.md.'
  else
    echo '  4. Przejdź listę kontrolną odbioru w docs/operations.md.'
  fi
}

main() {
  if [ "$#" -gt 0 ]; then
    echo 'Użycie: scripts/install.sh (bez argumentów)' >&2
    exit 1
  fi
  step_k1
  step_k2
  step_k3
  step_k4
  step_k5
  step_k6
  step_k7
  step_k8
  step_k9
  print_reminder
}

main "$@"
