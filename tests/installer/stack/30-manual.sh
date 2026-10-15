#!/usr/bin/env bash
# S10 on a real stack: a manual installation (compose.yml by hand, no variant, no VAPID keys),
# then the installer: existing values untouched, data kept, missing keys added.
# shellcheck source=tests/installer/stack/lib.sh
. "$(dirname "$0")/lib.sh"

cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"
set_manual() { sed -i "s|^$1=.*|$1=$2|" "$INSTALL_DIR/.env"; }
set_manual POSTGRES_PASSWORD reczne-haslo-bazy-30
set_manual APP_DOMAIN przepisy.example.test
set_manual APP_BASE_URL https://przepisy.example.test
set_manual ALLOWED_EMAIL owner@example.test
set_manual GOOGLE_CLIENT_ID test-client.apps.googleusercontent.com
set_manual GOOGLE_CLIENT_SECRET GOCSPX-test-only-secret
set_manual BACKUP_AGE_RECIPIENT age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p

stack_compose up -d --build --wait db >/dev/null 2>&1 || fail "S10: manual start of the database failed"
stack_compose up -d --build app >/dev/null 2>&1 || fail "S10: manual start of the app failed"
db_sql 'create table installer_probe (value text); insert into installer_probe values ('"'"'zachowane'"'"')' >/dev/null
[ -z "$(env_value HTTPS_MODE)" ] || fail "S10: the manual .env must have no variant"

# Lines of .env without the keys the installer is expected to add.
stable_lines() { grep -vE '^(HTTPS_MODE|VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)=' "$INSTALL_DIR/.env"; }
before="$(stable_lines)"

assert_installer_ok "S10: installer on a manual installation" HTTPS_MODE=proxy
assert_eq "$(stable_lines)" "$before" "S10: existing values changed"
assert_eq "$(env_value HTTPS_MODE)" proxy "S10: variant not written"
[ -n "$(env_value VAPID_PUBLIC_KEY)" ] && [ -n "$(env_value VAPID_PRIVATE_KEY)" ] || fail "S10: VAPID keys not added"
assert_eq "$(db_sql 'select value from installer_probe')" zachowane "S10: data lost"
assert_output_contains 'K9 Sprawdzenie: zrobione' "S10: health check did not report ok"
pass "S10: installer takes over a manual installation"
