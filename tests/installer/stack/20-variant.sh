#!/usr/bin/env bash
# S1, S9 on a real stack: variant proxy (no caddy, port only on 127.0.0.1) and switching variants.
# shellcheck source=tests/installer/stack/lib.sh
. "$(dirname "$0")/lib.sh"

assert_installer_ok "S1: installation in variant proxy" "${TEST_VALUES[@]}" HTTPS_MODE=proxy
service_running caddy && fail "S1: caddy runs in variant proxy"
service_running app || fail "S1: app does not run in variant proxy"
pass "S1: variant proxy runs the app without caddy"

# The production port mapping of compose.yml (the test override only moves it to a random port).
stack_compose -f "$INSTALL_DIR/compose.yml" config 2>/dev/null |
  grep -qE 'host_ip: 127\.0\.0\.1' || fail "S1: compose.yml does not bind the app to 127.0.0.1"
host_ip="$(docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostIp}}{{end}}{{end}}' "$(app_container)")"
assert_eq "$host_ip" 127.0.0.1 "S1: app listens on a host address other than 127.0.0.1"
pass "S1: the app listens only on 127.0.0.1"

switch_variant() {
  sed -i "s/^HTTPS_MODE=.*/HTTPS_MODE=$1/" "$INSTALL_DIR/.env"
  expected="$(env_checksum)"
  assert_installer_ok "S9: switch to $1"
  grep -qE '^K3 [^:]*: pominięty, już zrobione' "$INSTALL_OUT" || fail "S9: K3 was not skipped"
  assert_eq "$(env_checksum)" "$expected" "S9: .env changed after switching to $1"
}

switch_variant caddy
service_running caddy || fail "S9: caddy is not running after switching to caddy"
pass "S9: proxy -> caddy starts caddy"

switch_variant proxy
service_running caddy && fail "S9: caddy still runs after switching to proxy"
service_running app || fail "S9: app stopped after switching to proxy"
pass "S9: caddy -> proxy stops caddy"
