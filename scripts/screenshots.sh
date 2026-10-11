#!/usr/bin/env bash
# Refreshes the screen screenshots in docs/screenshots/<variant>/<id>.png:
# 390 px light and dark, and 1280 px light, of every screen in tests/e2e/screens.ts.
#
# Extra arguments go to Playwright, e.g. scripts/screenshots.sh -g "planer|zakupy"
# refreshes only those screens. Other files in docs/screenshots are left alone.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR"

E2E_SCREENSHOTS=1 exec scripts/test-e2e.sh tests/e2e/screens.spec.ts --project mobile-chromium "$@"
