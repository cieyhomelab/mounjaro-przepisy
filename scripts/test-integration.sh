#!/usr/bin/env bash
# Integration tests (Vitest) against a throwaway PostgreSQL in its own Compose project.
# Extra arguments are passed to Vitest.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR"

load_secrets
PROJECT="it-$(run_id)"

compose() {
  docker compose -p "$PROJECT" -f compose.test.yml "$@"
}

cleanup() {
  compose --profile runner down -v --remove-orphans --rmi local >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose --profile runner build --quiet
compose up -d --wait db
compose --profile runner run --rm tests "$@"
