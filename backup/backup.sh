#!/usr/bin/env bash
# Encrypted database backups: pg_dump -> age (public key) -> $BACKUP_DIR, every BACKUP_INTERVAL_HOURS.
# Files older than BACKUP_RETENTION_DAYS are deleted, so the data of a deleted account is gone from
# the backups before the 30 days promised to the user (S16).
#
# Environment:
#   BACKUP_AGE_RECIPIENT    required; age public key (age1…). The private key never reaches the server.
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE   connection to the database (libpq variables).
#   BACKUP_DIR              default /backups
#   BACKUP_INTERVAL_HOURS   default 6
#   BACKUP_RETENTION_DAYS   default 29
#   BACKUP_ONCE             1 = make one backup, prune and exit (used by scripts/restore-drill.sh)
set -euo pipefail

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required (age public key, see docs/operations.md)}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-29}"

log() {
  printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

backup_once() {
  mkdir -p "$BACKUP_DIR"
  name="app-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
  tmp="$BACKUP_DIR/.$name.part"
  # The plain dump only ever exists in the pipe; a failed run leaves no readable file behind.
  if ! pg_dump --format=custom | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$tmp"; then
    rm -f "$tmp"
    log "FAILED"
    return 1
  fi
  mv "$tmp" "$BACKUP_DIR/$name"
  log "created $name"
}

prune() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'app-*.dump.age' -mtime "+$((RETENTION_DAYS - 1))" -print -delete |
    while read -r old; do log "deleted $(basename "$old")"; done
  # Leftovers of an interrupted run.
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '.app-*.part' -mmin +60 -delete
}

if [ "${BACKUP_ONCE:-}" = "1" ]; then
  backup_once
  prune
  exit 0
fi

while true; do
  # A failed backup is logged and retried in the next cycle; the loop keeps running.
  backup_once || true
  prune
  sleep "$((INTERVAL_HOURS * 3600))"
done
