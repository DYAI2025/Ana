#!/usr/bin/env bash
# CI test of restore-nightly.sh: every outcome the README states, run as root on Ubuntu 24.04 with stubbed systemctl,
# brain.sh and node. Everything lives under a scratch ANA_BRAIN_ROOT; /var/lib and /srv are never touched.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
r="$(mktemp -d)"
trap 'rm -rf "$r"' EXIT
chmod 0755 "$r"   # ana-brain reaches the node stub and the extracted copy through it
fail() { echo "FAIL: $*"; sed 's/^/  | /' "$r/out" 2>/dev/null || true; exit 1; }
ok() { echo "ok: $*"; }
id ana-brain >/dev/null 2>&1 || useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin ana-brain

log="$r/calls"
stubs="$r/stubs"
base="$r/srv/dyai/runtime/ana-brain"
lib="$r/var/lib/ana-brain"
bk="$r/var/backups/ana-brain"
mkdir -p "$stubs" "$base/current/dist" "$bk" "$r/fsm"
chmod 1777 "$r/fsm"
touch "$base/current/dist/cli.js"
printf '#!/bin/sh\necho "systemctl $*" >> %s\n' "$log" > "$stubs/systemctl"
printf '#!/bin/sh\necho "brain.sh $*" >> %s\n[ ! -e %s/index-fails ]\n' "$log" "$r" > "$base/brain.sh"
# the release's validate, run as ana-brain: fails on a vault that carries BROKEN
printf '#!/bin/sh\necho "validate $(id -un) $BRAIN_VAULT_DIR" >> %s\n[ ! -e "$BRAIN_VAULT_DIR/BROKEN" ]\n' "$log" > "$stubs/node"
chmod 0755 "$stubs" "$stubs"/* "$base/brain.sh"

archive() { # <date> <content of n.md> [broken-git|invalid|fsmonitor]
  local w
  w="$(mktemp -d)"
  mkdir "$w/vault" "$w/state"
  echo "revoked-key-hash" > "$w/state/keys.json"
  git -C "$w/vault" init -q
  echo "$2" > "$w/vault/n.md"
  git -C "$w/vault" add n.md
  git -C "$w/vault" -c user.name=t -c user.email=t@example.test commit -qm seed
  case "${3:-}" in
    broken-git) rm -f "$(find "$w/vault/.git/objects" -type f -path '*/objects/??/*' -print -quit)" ;;
    invalid) touch "$w/vault/BROKEN" ;;
    # what a compromised Brain could plant in its own .git/config before the nightly archive
    # (git appends arguments to the hook command; "; true" absorbs them)
    fsmonitor) git -C "$w/vault" config core.fsmonitor "id -un >> $r/fsm/ran; true" ;;
  esac
  chown -R ana-brain:ana-brain "$w/vault"
  tar -C "$w" -czf "$bk/ana-brain-$1.tar.gz" vault state
  rm -rf "$w"
}
live() {
  rm -rf "$lib"
  install -d -m 0700 -o ana-brain -g ana-brain "$lib" "$lib/state" "$lib/vault"
  echo live > "$lib/vault/n.md"
  echo "current-key-hash" > "$lib/state/keys.json"
}
run() {
  : > "$log"
  chmod 0666 "$log"
  set +e
  env PATH="$stubs:$PATH" ANA_BRAIN_ROOT="$r" ANA_BRAIN_NODE="$stubs/node" bash "$here/restore-nightly.sh" "$@" > "$r/out" 2>&1
  rc=$?
  set -e
}
kept() { find "$lib" -maxdepth 1 -name 'vault.before-restore-*' | wc -l; }
copies() { find "$lib" -maxdepth 1 -name '.restore.*' | wc -l; }
called() { grep -qxF "$1" "$log"; }

archive 2026-10-01 archived
archive 2026-10-02 broken broken-git
archive 2026-10-03 invalid invalid
archive 2026-10-04 planted fsmonitor
stopped="systemctl stop dyai-ana-brain-index.timer dyai-ana-brain-index.service dyai-ana-brain.service"
empty_state="state was empty or lost and is recreated empty"

live
run ana-brain-2026-10-01.tar.gz
[ "$rc" = 0 ] || fail "good archive, live vault present: rc $rc"
[ "$(head -1 "$log")" = "$stopped" ] || fail "the Brain and its index were not stopped before anything else"
! grep -qF "$empty_state" "$r/out" || fail "a kept state was reported as empty"
[ "$(cat "$lib/vault/n.md")" = archived ] || fail "the vault was not restored"
[ "$(kept)" = 1 ] || fail "the previous vault was not kept"
[ "$(cat "$lib/state/keys.json")" = current-key-hash ] || fail "state was restored from the archive"
[ "$(copies)" = 0 ] || fail "the extracted copy was left behind"
[ "$(stat -c '%U %a' "$lib/vault")" = "ana-brain 700" ] || fail "vault owner/mode: $(stat -c '%U %a' "$lib/vault")"
grep -q "^validate ana-brain $lib/.restore\." "$log" || fail "validate did not run as ana-brain on the extracted copy"
called "systemctl start dyai-ana-brain.service" && called "brain.sh index --full" && called "systemctl start dyai-ana-brain-index.timer" || fail "the Brain, the full index or the timer was not started"
ok "restores, keeps the previous vault, never restores state, validates the copy as ana-brain, starts and re-indexes"

rm -rf "$lib"
run ana-brain-2026-10-01.tar.gz
[ "$rc" = 0 ] || fail "good archive, /var/lib/ana-brain lost: rc $rc"
[ "$(cat "$lib/vault/n.md")" = archived ] || fail "the lost vault was not restored"
[ "$(stat -c '%U %a' "$lib/state")" = "ana-brain 700" ] || fail "the lost state directory was not recreated"
[ ! -e "$lib/state/keys.json" ] || fail "state was restored from the archive"
grep -qF "$empty_state" "$r/out" || fail "a lost state was not reported (every key and token must be issued again)"
ok "restores a lost vault, recreates an empty state directory and says keys must be issued again"

for c in "2026-10-02|git fsck" "2026-10-03|validate"; do
  day="${c%%|*}" check="${c#*|}"
  live
  run "ana-brain-$day.tar.gz"
  [ "$rc" != 0 ] || fail "an archive that fails $check was restored"
  [ "$(head -1 "$log")" = "$stopped" ] || fail "a failed $check did not stop the Brain first"
  [ "$(cat "$lib/vault/n.md")" = live ] || fail "a failed $check changed the live vault"
  [ "$(kept)" = 0 ] || fail "a failed $check moved the live vault"
  [ "$(copies)" = 1 ] || fail "a failed $check removed the extracted copy"
  ! grep -q "start" "$log" || fail "a failed $check started something"
  grep -q "stopped while checking the archive (nothing was moved" "$r/out" || fail "a failed $check does not say that nothing was moved"
  ok "an archive that fails $check moves nothing, starts nothing and keeps the copy"
done

live
touch "$r/index-fails"
run ana-brain-2026-10-01.tar.gz
[ "$rc" != 0 ] || fail "a failed index run was not reported"
[ "$(cat "$lib/vault/n.md")" = archived ] && [ "$(kept)" = 1 ] || fail "after the swap: restored vault or kept vault missing"
! called "systemctl start dyai-ana-brain-index.timer" || fail "the index timer started after a failed full index"
grep -q "stopped while starting the Brain on the restored, validated vault; finish by hand" "$r/out" || fail "a failure after the swap does not name the remaining steps"
ok "a failure after the swap names the remaining steps and leaves the timer off"
rm -f "$r/index-fails"

# positive control: the planted hook fires when root runs git fsck on the copy, as the restore did before
x="$(mktemp -d)"
tar -C "$x" -xzf "$bk/ana-brain-2026-10-04.tar.gz" vault
git -c safe.directory="$x/vault" -C "$x/vault" fsck --full --strict >/dev/null 2>&1 || true
rm -rf "$x"
grep -qx root "$r/fsm/ran" 2>/dev/null || fail "positive control: a planted core.fsmonitor did not run under root git fsck"
rm -f "$r/fsm/ran"
live
run ana-brain-2026-10-04.tar.gz
[ "$rc" = 0 ] || fail "an archive with a planted core.fsmonitor: rc $rc"
! grep -qx root "$r/fsm/ran" 2>/dev/null || fail "the archive's core.fsmonitor ran as root"
ok "nothing from the archive runs as root (a planted core.fsmonitor stays inert)"

live
run ../ana-brain-2026-10-01.tar.gz
[ "$rc" != 0 ] && [ ! -s "$log" ] || fail "a bad archive name was not refused before anything ran"
ok "refuses a bad archive name before stopping anything"
