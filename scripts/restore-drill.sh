#!/usr/bin/env bash
# Restore drill: makes an encrypted backup of test data with the `backup` image, checks the
# encryption and the pruning of old files, restores the backup into a second database and compares
# the data. Runs on throwaway containers (Compose project rd-<id>); CI runs it on every change.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR"

PROJECT="rd-$(run_id)"

compose() {
  docker compose -p "$PROJECT" -f compose.restore-drill.yml "$@"
}

cleanup() {
  compose --profile runner down -v --remove-orphans --rmi local >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose --profile runner build --quiet
compose up -d --wait db
compose --profile runner run --rm drill
