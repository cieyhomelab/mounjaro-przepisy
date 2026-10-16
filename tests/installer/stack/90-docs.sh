#!/usr/bin/env bash
# S11: documentation of the installer and of the manual path. Needs no Docker; reads README.md and
# docs/operations.md of the repository copy.
# shellcheck source=tests/installer/stack/lib.sh
. "$(dirname "$0")/lib.sh"

README="$INSTALL_DIR/README.md"
OPS="$INSTALL_DIR/docs/operations.md"

# section <file> <heading>: text of a "## <heading>" section up to the next "## " heading.
section() {
  awk -v h="## $2" '$0 == h { on = 1; next } /^## / { on = 0 } on' "$1"
}

has() { # has <text> <needle> <message>
  grep -qF -- "$2" <<<"$1" || fail "$3"
}

readme_deploy="$(section "$README" "Wdrożenie")"
[ -n "$readme_deploy" ] || fail "README.md has no section Wdrożenie"
has "$readme_deploy" 'scripts/install.sh' "README: no installer command in Wdrożenie"
has "$readme_deploy" 'docs/operations.md#instalacja-ręczna' "README: no link to the manual path in Wdrożenie"
pass "S11: README Wdrożenie has the installer command and a link to the manual path"

first="$(section "$OPS" "Pierwsze uruchomienie")"
[ -n "$first" ] || fail "operations.md has no section Pierwsze uruchomienie"
has "$first" 'scripts/install.sh' "Pierwsze uruchomienie: no installer command"
has "$first" 'zalecan' "Pierwsze uruchomienie: installer is not marked as recommended"
has "$first" 'HTTPS_MODE' "Pierwsze uruchomienie: no HTTPS_MODE"
has "$first" 'caddy' "Pierwsze uruchomienie: no value caddy"
has "$first" 'proxy' "Pierwsze uruchomienie: no value proxy"
for name in APP_DOMAIN ALLOWED_EMAIL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET BACKUP_AGE_RECIPIENT; do
  has "$first" "$name" "Pierwsze uruchomienie: variable $name is not listed"
done
has "$first" 'read -rs GOOGLE_CLIENT_SECRET' "Pierwsze uruchomienie: no safe way to pass secrets (read -rs)"
has "$first" 'set -a; . ' "Pierwsze uruchomienie: no safe way to pass secrets (file with chmod 600)"
has "$first" 'Zmiana wariantu' "Pierwsze uruchomienie: no description of switching the variant"
has "$first" 'docker compose --profile tls up -d --build' "Pierwsze uruchomienie: no manual step list"
pass "S11: Pierwsze uruchomienie has the installer, variables, secrets, variant switch and manual steps"

update="$(section "$OPS" "Aktualizacja")"
has "$update" 'git pull' "Aktualizacja: no git pull"
has "$update" 'scripts/install.sh' "Aktualizacja: no installer rerun"
pass "S11: Aktualizacja has git pull and the installer"

has "$(section "$OPS" "Diagnostyka")" 'logs --tail 100 app' "Diagnostyka: no logs command"
pass "S11: Diagnostyka has the logs command"
