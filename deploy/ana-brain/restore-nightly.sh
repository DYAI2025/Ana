#!/usr/bin/env bash
# Restores the ANA Brain vault on the Contabo VPS vmi3693936 from a nightly archive of dyai-ana-brain-backup.service.
# Run as root:  /srv/dyai/runtime/ana-brain/restore-nightly.sh ana-brain-<YYYY-MM-DD>.tar.gz
#
# Only `vault` is restored, never `state`: it holds the key and token hashes of that night, and a key revoked since
# then would work again. Every check (git fsck, the release's own `validate`) runs on the extracted copy before anything
# is moved, so a failed check leaves the live vault, the state and the stopped Brain as they were. A vault that is still
# there is kept beside the restored one, never deleted. test-restore-nightly.sh runs every branch in CI; ANA_BRAIN_ROOT
# and ANA_BRAIN_NODE exist only for that test.
set -euo pipefail

root="${ANA_BRAIN_ROOT:-}"
node="${ANA_BRAIN_NODE:-/usr/bin/node}"
base="$root/srv/dyai/runtime/ana-brain"
lib="$root/var/lib/ana-brain"
v="$lib/vault"
step="checking the arguments"
trap 'echo "restore-nightly: stopped while $step" >&2' ERR

fail() { echo "restore-nightly: $*" >&2; exit 1; }

[[ "$(id -u)" == 0 ]] || fail "run as root"
[[ $# -eq 1 && "$1" =~ ^ana-brain-[0-9]{4}-[0-9]{2}-[0-9]{2}\.tar\.gz$ ]] || fail "usage: restore-nightly.sh ana-brain-<YYYY-MM-DD>.tar.gz"
archive="$root/var/backups/ana-brain/$1"
[[ -f "$archive" ]] || fail "no archive $archive"
[[ -f "$base/current/dist/cli.js" ]] || fail "no current release in $base (release.sh first)"

step="stopping the Brain"
systemctl stop dyai-ana-brain-index.timer dyai-ana-brain-index.service dyai-ana-brain.service
# the units' ReadWritePaths= need both directories, also when they were lost with the vault
install -d -m 0700 -o ana-brain -g ana-brain "$lib" "$lib/state"

step="checking the archive (nothing was moved; the Brain stays stopped; the copy stays in $lib/.restore.*)"
t="$(mktemp -d "$lib/.restore.XXXXXX")"
chown ana-brain:ana-brain "$t"
tar -C "$t" -xzf "$archive" vault   # keeps owner ana-brain
git -c safe.directory="$t/vault" -C "$t/vault" fsck --full --strict
(cd "$base/current" && runuser -u ana-brain -- env -i PATH=/usr/bin:/bin BRAIN_VAULT_DIR="$t/vault" BRAIN_STATE_DIR="$lib/state" "$node" dist/cli.js validate)

step="moving the restored vault into place"
kept=""
if [[ -e "$v" ]]; then
  kept="$v.before-restore-$(date +%F-%H%M%S)"
  mv -T "$v" "$kept"
fi
mv -T "$t/vault" "$v"
rmdir "$t"
chmod 0700 "$v"
echo "restore-nightly: vault restored from $1 and validated${kept:+; the previous vault is kept as $kept}"

step="starting the Brain on the restored, validated vault; finish by hand: systemctl start dyai-ana-brain.service, brain.sh index --full, systemctl start dyai-ana-brain-index.timer"
systemctl start dyai-ana-brain.service
"$base/brain.sh" index --full   # the archive's index state is older than the live collection: re-embed every note
systemctl start dyai-ana-brain-index.timer
echo "restore-nightly: done"
