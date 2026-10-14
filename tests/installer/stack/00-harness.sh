#!/usr/bin/env bash
# Checks the stack harness itself: the copy, the isolated Compose project and the override.
# shellcheck source=tests/installer/stack/lib.sh
. "$(dirname "$0")/lib.sh"

[ -f "$INSTALL_DIR/compose.yml" ] || fail "repository copy has no compose.yml"
[ ! -e "$INSTALL_DIR/.env" ] || fail "repository copy must start without .env"

printf 'POSTGRES_PASSWORD=harness-only\nAPP_DOMAIN=przepisy.example.test\n' >"$INSTALL_DIR/.env"
config="$(stack_compose --profile tls config)"
grep -qF -- '--internal-certs' <<<"$config" || fail "override does not replace the caddy command"
if stack_compose --profile tls config --services | grep -qx backup; then
  fail "override must leave the backup service out"
fi
pass "override applies to the copy"

stack_compose up -d --wait db >/dev/null 2>&1 || fail "database of the test project did not start"
docker volume inspect "${MP_INSTALL_PROJECT}_db-data" >/dev/null 2>&1 ||
  fail "database volume is not scoped to ${MP_INSTALL_PROJECT}"
pass "database runs in project ${MP_INSTALL_PROJECT}"
