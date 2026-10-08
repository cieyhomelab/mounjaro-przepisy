#!/usr/bin/env bash
# Lint, formatting check and type check.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

run_in_dev npm run lint
