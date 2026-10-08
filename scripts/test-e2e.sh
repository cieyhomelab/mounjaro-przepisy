#!/usr/bin/env bash
# End-to-end tests (Playwright) against a temporary instance of the whole stack.
#
# Contract:
# - Compose project e2e-${E2E_RUN_ID}; a random id is generated when the variable is unset.
# - No host ports are published: the Playwright container shares the app's network namespace.
# - Always cleans up (containers, networks, volumes, images), also on failure and interrupt.
# - Loads secrets from ${SH_SECRETS_DIR:-$HOME/.sh-secrets}/mounjaro-przepisy.env when present;
#   works without them, external integrations run in mock mode.
# - On failure, traces and screenshots are copied to test-results/e2e-<id>/.
#
# Extra arguments are passed to Playwright, e.g. scripts/test-e2e.sh --project mobile-chromium
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR"

load_secrets
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-e2e-local-only}"
PROJECT="e2e-$(run_id)"
RUNNER="${PROJECT}-runner"

compose() {
  docker compose -p "$PROJECT" -f compose.yml -f compose.e2e.yml "$@"
}

cleanup() {
  docker rm -f "$RUNNER" >/dev/null 2>&1 || true
  compose --profile runner down -v --remove-orphans --rmi local >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "E2E project: ${PROJECT}"
compose --profile runner build --quiet
if ! compose up -d --wait db app fixtures; then
  compose logs --no-color app db | tail -n 100
  exit 1
fi

status=0
compose --profile runner run --name "$RUNNER" e2e "$@" || status=$?

if [ "$status" -ne 0 ]; then
  mkdir -p "test-results/${PROJECT}"
  docker cp "${RUNNER}:/e2e/test-results/." "test-results/${PROJECT}/" >/dev/null 2>&1 || true
  compose logs --no-color app | tail -n 100 >"test-results/${PROJECT}/app.log" 2>&1 || true
  echo "E2E failed; artifacts in test-results/${PROJECT}/"
fi
exit "$status"
