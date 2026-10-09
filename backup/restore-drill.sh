#!/usr/bin/env bash
# Runs inside the drill container (see scripts/restore-drill.sh). Proves on test data that a backup
# made by backup.sh is encrypted, is pruned by age, and restores into an identical database.
set -euo pipefail

BACKUP_DIR=/backups
export BACKUP_DIR
fail() {
  echo "RESTORE DRILL FAILED: $1" >&2
  exit 1
}
psql_app() { psql -v ON_ERROR_STOP=1 -qAt "$@"; }

echo "== keys"
age-keygen -o /tmp/drill-key.txt 2>/dev/null
RECIPIENT="$(age-keygen -y /tmp/drill-key.txt)"
age-keygen -o /tmp/other-key.txt 2>/dev/null
export BACKUP_AGE_RECIPIENT="$RECIPIENT"

echo "== schema and test data"
for migration in $(ls /drizzle/*.sql | sort); do
  psql_app -f "$migration" >/dev/null
done
psql_app <<'SQL'
insert into accounts (id, email, created_at)
  values ('00000000-0000-4000-8000-000000000001', 'drill@example.test', now());
insert into recipes (id, account_id, title, kind, servings, ingredients, steps, own_rating, created_at, updated_at)
  values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
          'Omlet restore-drill', 'manual', 2, '[{"originalText":"3 jajka"}]', '["Wymieszaj."]', 4, now(), now());
insert into recipe_photos (id, account_id, recipe_id, content, content_type, width, height, byte_size, created_at)
  values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002', decode('524946460000000057454250', 'hex'),
          'image/webp', 1, 1, 12, now());
insert into cook_events (id, account_id, recipe_id, cooked_on, created_at)
  values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002', '2026-10-14', now());
SQL

echo "== old backups for the retention check"
mkdir -p "$BACKUP_DIR"
stamp() { date -u -d "@$(($(date +%s) - $1 * 86400))" +%Y%m%d%H%M.%S; }
touch -t "$(stamp 30)" "$BACKUP_DIR/app-20200101T000000Z.dump.age"
touch -t "$(stamp 28)" "$BACKUP_DIR/app-20200102T000000Z.dump.age"

echo "== backup"
BACKUP_ONCE=1 backup.sh
[ ! -e "$BACKUP_DIR/app-20200101T000000Z.dump.age" ] || fail "a backup older than 29 days was kept"
[ -e "$BACKUP_DIR/app-20200102T000000Z.dump.age" ] || fail "a backup younger than 29 days was deleted"
shopt -s nullglob
fresh=("$BACKUP_DIR"/app-2???????T??????Z.dump.age)
newest=""
for file in "${fresh[@]}"; do
  [ "$file" = "$BACKUP_DIR/app-20200101T000000Z.dump.age" ] || [ "$file" = "$BACKUP_DIR/app-20200102T000000Z.dump.age" ] || newest="$file"
done
[ -n "$newest" ] || fail "no new backup file"

echo "== encryption"
[ "$(head -c 5 "$newest")" != "PGDMP" ] || fail "backup is a plain dump"
grep -q 'Omlet restore-drill' "$newest" && fail "test data readable in the backup"
if age --decrypt -i /tmp/other-key.txt "$newest" >/dev/null 2>&1; then
  fail "backup decrypts with a foreign key"
fi
leftovers=("$BACKUP_DIR"/.app-*.part)
[ "${#leftovers[@]}" -eq 0 ] || fail "temporary files left behind"

echo "== restore"
createdb restored
age --decrypt -i /tmp/drill-key.txt "$newest" | pg_restore --dbname=restored --no-owner --exit-on-error
query() {
  psql_app -d "$1" -c "select
    (select count(*) from accounts), (select count(*) from recipes), (select count(*) from cook_events),
    (select title from recipes), (select own_rating from recipes),
    (select md5(content) from recipe_photos), (select cooked_on from cook_events)"
}
original="$(query app)"
restored="$(query restored)"
[ "$original" = "$restored" ] || fail "restored data differs: '$original' vs '$restored'"
[ "$original" = "1|1|1|Omlet restore-drill|4|$(printf '\x52\x49\x46\x46\x00\x00\x00\x00\x57\x45\x42\x50' | md5sum | cut -d' ' -f1)|2026-10-14" ] ||
  fail "unexpected restored content: $original"

echo "RESTORE DRILL OK"
