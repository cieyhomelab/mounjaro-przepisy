#!/usr/bin/env bash
# Shared helpers for scripts/*.sh. Source it, do not execute.
# The toolchain (Node 24, npm) runs in Docker, so the host needs only Docker and bash.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_NAME="mounjaro-przepisy"
export DOCKER_BUILDKIT=1

# Loads secrets for agents and tests, when the file exists.
load_secrets() {
  local file="${SH_SECRETS_DIR:-$HOME/.sh-secrets}/${REPO_NAME}.env"
  if [ -f "$file" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
  fi
}

# Prints a run id safe for a Compose project name: lowercase letters, digits, - and _.
run_id() {
  local id="${E2E_RUN_ID:-}"
  if [ -z "$id" ]; then
    id="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
  fi
  printf '%s' "$id" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-'
}

# Builds the toolchain image (Dockerfile target "dev") and prints its id.
# Untagged on purpose: parallel runs from different worktrees cannot overwrite each other.
dev_image() {
  docker build --quiet --target dev "$ROOT_DIR"
}

# Runs a command in the toolchain image with the current sources baked in.
run_in_dev() {
  local image
  image="$(dev_image)"
  docker run --rm --init "$image" "$@"
}
