#!/usr/bin/env bash
# S1-S3 on a real stack: two runs without a terminal, precedence of .env over the shell, data kept.
# shellcheck source=tests/installer/stack/lib.sh
. "$(dirname "$0")/lib.sh"

assert_installer_ok "S2: first run without a terminal" "${TEST_VALUES[@]}" HTTPS_MODE=caddy
assert_output_contains 'K9 Sprawdzenie: zrobione' "S1: health check did not report ok"
assert_output_contains '/api/auth/google/callback' "S1: reminder has no OAuth return address"
service_running caddy || fail "S1: caddy is not running in variant caddy"
assert_eq "$(stat -c %a "$INSTALL_DIR/.env")" 600 "S2: .env mode"
pass "S1, S2: first installation without a terminal"

db_sql 'create table installer_probe (value text); insert into installer_probe values ('"'"'zachowane'"'"')' >/dev/null
container="$(app_container)"
before="$(env_checksum)"

assert_installer_ok "S3: second run"
for n in 2 3 4 5 6; do
  grep -qE "^K${n} [^:]*: pominięty, już zrobione" "$INSTALL_OUT" || fail "S3: step K${n} was not skipped"
done
assert_eq "$(env_checksum)" "$before" "S3: .env changed on the second run"
pass "S3: second run skips K2-K6 and leaves .env untouched"

password="$(env_value POSTGRES_PASSWORD)"
assert_installer_ok "S3: run with other values in the shell" \
  ALLOWED_EMAIL=inny@example.test POSTGRES_PASSWORD=inne-haslo-z-powloki
assert_eq "$(env_checksum)" "$before" "S3: shell values changed .env"
assert_eq "$(app_env ALLOWED_EMAIL)" owner@example.test "S3: app does not use ALLOWED_EMAIL from .env"
[[ "$(app_env DATABASE_URL)" == *":${password}@db"* ]] || fail "S3: app does not use POSTGRES_PASSWORD from .env"
assert_eq "$(db_sql 'select value from installer_probe')" zachowane "S3: row lost after rerun"
pass "S3: values from .env win over the shell, data survives"

sed -i 's/^ALLOWED_EMAIL=.*/ALLOWED_EMAIL=nowy@example.test/' "$INSTALL_DIR/.env"
assert_installer_ok "S3: run after a manual change"
assert_eq "$(env_value ALLOWED_EMAIL)" nowy@example.test "S3: manual change lost"
assert_eq "$(app_env ALLOWED_EMAIL)" nowy@example.test "S3: app does not use the changed ALLOWED_EMAIL"
pass "S3: manual change of ALLOWED_EMAIL reaches the app"

container="$(app_container)"
started_at="$(docker inspect -f '{{.State.StartedAt}}' "$container")"
cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.saved"
sed -i 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=/' "$INSTALL_DIR/.env"
if run_installer; then fail "S3: cleared POSTGRES_PASSWORD did not fail"; fi
assert_output_contains 'K4 Hasło bazy: błąd' "S3: cleared password not reported in K4"
assert_eq "$(docker inspect -f '{{.State.Running}} {{.State.StartedAt}}' "$container")" "true $started_at" \
  "S3: app was restarted or removed after a failed run"
mv "$INSTALL_DIR/.env.saved" "$INSTALL_DIR/.env"
assert_eq "$(db_sql 'select value from installer_probe')" zachowane "S3: row lost after failed run"
pass "S3: cleared password fails without touching the app or the data"
