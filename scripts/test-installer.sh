#!/usr/bin/env bash
# Installer scenarios on a real Docker stack (docs/adr/0003-instalator-na-serwer.md, decision 11).
#
# Contract:
# - Every scenario tests/installer/stack/*.sh runs on a fresh copy of the current files of the
#   repository (tracked and untracked, without ignored ones), in its own Compose project
#   inst-<run id>-<scenario>; the run id comes from E2E_RUN_ID or is random.
# - No fixed host ports: tests/installer/compose.installer-test.yml replaces them.
# - Always cleans up (containers, networks, volumes, images, the copies), also on failure and
#   interrupt, and fails when anything of the run is left behind.
# - Arguments select scenarios by file name, e.g. scripts/test-installer.sh 10-noninteractive
#
# Not part of validation.commands: CI runs it in its own job; AGENTS.md says when to run it locally.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR"

RUN="inst-$(run_id)"
WORK="$(mktemp -d)"
projects=()

remove_project() {
  local project="$1" dir="$2"
  local env_file=()
  [ -f "$dir/.env" ] && env_file=(--env-file "$dir/.env")
  POSTGRES_PASSWORD=cleanup docker compose -p "$project" --project-directory "$dir" "${env_file[@]}" \
    -f "$dir/compose.yml" -f "$dir/tests/installer/compose.installer-test.yml" --profile tls \
    down -v --remove-orphans --rmi local >/dev/null 2>&1 || true
}

cleanup() {
  local project
  for project in "${projects[@]}"; do
    remove_project "$project" "$WORK/$project"
  done
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

scenarios=()
for file in tests/installer/stack/[0-9]*.sh; do
  name="$(basename "$file" .sh)"
  if [ "$#" -eq 0 ] || printf '%s\n' "$@" | grep -qxF "$name"; then
    scenarios+=("$name")
  fi
done
[ "${#scenarios[@]}" -gt 0 ] || { echo "No scenario matches: $*" >&2; exit 1; }

echo "Installer test run: ${RUN}"
failed=()
for name in "${scenarios[@]}"; do
  project="$(printf '%s-%s' "$RUN" "${name%%-*}" | tr -c 'a-z0-9_-' '-')"
  dir="$WORK/$project"
  projects+=("$project")
  mkdir -p "$dir"
  git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf - | tar -xf - -C "$dir"
  rm -f "$dir/.env"

  echo "--- ${name} (${project})"
  if INSTALL_DIR="$dir" MP_INSTALL_PROJECT="$project" \
    MP_INSTALL_COMPOSE_OVERRIDE="$dir/tests/installer/compose.installer-test.yml" \
    bash "$dir/tests/installer/stack/${name}.sh"; then
    echo "PASS ${name}"
  else
    echo "FAIL ${name}"
    failed+=("$name")
  fi
  remove_project "$project" "$dir"
  leftovers="$(docker ps -aq --filter "label=com.docker.compose.project=${project}")$(docker volume ls -q --filter "label=com.docker.compose.project=${project}")"
  if [ -n "$leftovers" ]; then
    echo "FAIL ${name}: containers or volumes of ${project} left behind"
    failed+=("$name (cleanup)")
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All ${#scenarios[@]} installer scenario(s) passed"
