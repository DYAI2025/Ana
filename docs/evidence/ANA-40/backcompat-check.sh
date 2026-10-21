#!/usr/bin/env bash
# ANA-40 R2G (4): migration backward compatibility, rerunnable by a reviewer. Checks, all of which set the exit code:
#   (a) migrations/0001_init.sql of the candidate is byte-identical to the base;
#   (b) every 0002_*.sql holds only `ALTER TABLE instagram_tokens ADD COLUMN <name> INTEGER|TEXT;` lines (plus comments):
#       no NOT NULL, DEFAULT, CHECK, trigger, UPDATE or other backfill;
#   (c) the BASE worker (src/ and test/worker.test.mjs of the base commit) passes against a test D1 that applies every
#       migrations/*.sql of the CANDIDATE in order (old code on the new schema).
# Each check has a canary that must make it fail, so a blind check is reported instead of passing silently.
# Needs node >= 22.13; no network, no wrangler, no secrets; writes only to a temp dir.
#
# Usage: docs/evidence/ANA-40/backcompat-check.sh [BASE] [CANDIDATE]   (defaults: merge-base with origin/main, HEAD)
# Exit: 0 = compatible and every canary failed as it must; 1 = a check failed; 2 = a canary did not fail (check is blind).
set -u
repo=$(git rev-parse --show-toplevel)
cand=$(git -C "$repo" rev-parse "${2:-HEAD}")
base=$(git -C "$repo" rev-parse "${1:-$(git -C "$repo" merge-base origin/main "$cand")}")
w=workers/instagram-oauth
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
status=0
fail() { echo "FAIL: $*"; status=1; }
blind() { echo "BLIND: $*"; [ "$status" -eq 1 ] || status=2; }

stage() { # $1 = target dir: base src + base test suite, candidate test D1 + candidate migrations
  mkdir -p "$1"
  git -C "$repo" archive "$base" "$w/src" "$w/test/worker.test.mjs" "$w/package.json" | tar -x -C "$1"
  git -C "$repo" archive "$cand" "$w/migrations" "$w/test/d1-sqlite.mjs" | tar -x -C "$1"
}
run() { (cd "$1/$w" && node --disable-warning=ExperimentalWarning --test test/worker.test.mjs) > "$1.log" 2>&1; }
summary() { grep -E '^# (tests|pass|fail) ' "$1.log" | tr '\n' ' '; }
additive_only() { # $1 = migration file; 0 when every non-comment line is a plain nullable ADD COLUMN
  ! grep -vE '^[[:space:]]*(--.*)?$' "$1" | grep -qvE '^ALTER TABLE instagram_tokens ADD COLUMN [a-z_]+ (INTEGER|TEXT);$'
}

echo "base      $base"
echo "candidate $cand"
stage "$tmp/compat"
migrations="$tmp/compat/$w/migrations"
echo "candidate migrations: $(ls "$migrations" | tr '\n' ' ')"

# (a) 0001 byte-identical, with a canary that changes one byte
git -C "$repo" show "$base:$w/migrations/0001_init.sql" > "$tmp/base-0001.sql"
if cmp -s "$tmp/base-0001.sql" "$migrations/0001_init.sql"; then echo "(a) 0001 identical to base: yes"; else fail "(a) 0001 differs from base"; fi
{ cat "$migrations/0001_init.sql"; echo '-- changed'; } > "$tmp/canary-0001.sql"
if cmp -s "$tmp/base-0001.sql" "$tmp/canary-0001.sql"; then blind "(a) a changed 0001 compares equal"; else echo "(a) canary (changed 0001) detected: yes"; fi

# (b) 0002 additive only, with one canary per forbidden form
found=0
for f in "$migrations"/0002_*.sql; do
  [ -e "$f" ] || continue; found=1
  if additive_only "$f"; then echo "(b) $(basename "$f") additive only: yes"; else fail "(b) $(basename "$f") is not additive only:"; grep -vE '^[[:space:]]*(--.*)?$' "$f"; fi
done
[ "$found" -eq 1 ] || fail "(b) no 0002_*.sql in the candidate"
for bad in 'ALTER TABLE instagram_tokens ADD COLUMN x INTEGER NOT NULL;' 'ALTER TABLE instagram_tokens ADD COLUMN x TEXT DEFAULT '"'"'OK'"'"';' \
           'ALTER TABLE instagram_tokens ADD COLUMN x INTEGER CHECK (x > 0);' 'UPDATE instagram_tokens SET last_check_at = 0;' \
           'CREATE TRIGGER t AFTER UPDATE ON instagram_tokens BEGIN SELECT 1; END;' 'ALTER TABLE instagram_tokens DROP COLUMN last_refresh_error;'; do
  printf 'ALTER TABLE instagram_tokens ADD COLUMN ok INTEGER;\n%s\n' "$bad" > "$tmp/canary-0002.sql"
  if additive_only "$tmp/canary-0002.sql"; then blind "(b) accepted: $bad"; fi
done
echo "(b) canaries (NOT NULL, DEFAULT, CHECK, UPDATE, TRIGGER, DROP) rejected: $([ "$status" -eq 2 ] && echo NO || echo yes)"

# (c) old code on the new schema, with a canary 0002 that breaks the base code
run "$tmp/compat"; rc=$?
echo "(c) old code on new schema: rc=$rc $(summary "$tmp/compat")"
[ "$rc" -eq 0 ] || fail "(c) base suite fails on the candidate schema"
stage "$tmp/canary"
for f in "$tmp/canary/$w/migrations/"0002_*.sql; do
  printf 'ALTER TABLE instagram_tokens DROP COLUMN last_refresh_error;\n' > "$f"
done
run "$tmp/canary"; canary=$?
echo "(c) canary (0002 drops last_refresh_error): rc=$canary $(summary "$tmp/canary")"
[ "$canary" -ne 0 ] || blind "(c) the base suite passed on an incompatible 0002"

echo "exit $status"
exit "$status"
