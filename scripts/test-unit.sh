#!/usr/bin/env bash
# Unit tests (Vitest). Extra arguments are passed to Vitest.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

run_in_dev npm run test:unit -- "$@"
