#!/usr/bin/env bash
# Runs npm in the project's Node version with the working tree mounted, e.g.
#   scripts/npm.sh install <package>     scripts/npm.sh run db:generate
# Use it for anything that must write to the working tree (package-lock.json, drizzle/).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

docker run --rm --init \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -v "$ROOT_DIR":/app -w /app \
  node:24-bookworm-slim npm "$@"
