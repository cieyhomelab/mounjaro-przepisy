#!/usr/bin/env bash
# Production build: client bundle, server bundle and the runtime image.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

image="$(docker build --quiet --target runtime "$ROOT_DIR")"
echo "Built runtime image ${image}"
