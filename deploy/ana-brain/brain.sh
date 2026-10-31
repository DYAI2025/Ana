#!/usr/bin/env bash
# The ANA Brain CLI on the Contabo VPS vmi3693936, run exactly as dyai-ana-brain.service runs the server: as the user
# ana-brain, from the current release, with the unit's pinned environment and its credential files. Run as root:
#   /srv/dyai/runtime/ana-brain/brain.sh validate | stats | index [--full] | issue-key <ana|ben|vince>
#   /srv/dyai/runtime/ana-brain/brain.sh revoke-key <ana|ben|vince> | issue-dashboard-token | drive-list
# A key or token is printed once on stdout; only its hash is stored. Never paste it into a ticket, log or chat.
#
# The credential files are root:root 600, so the CLI gets them the way the unit does: through systemd
# (LoadCredential=), not by loosening their mode. systemd-run starts this script a second time inside the transient
# unit (--in-unit), where $CREDENTIALS_DIRECTORY is set; no $ or % ever reaches systemd's own expansion. The
# Environment= values below must stay identical to the ones in dyai-ana-brain.service (CI compares them).
set -euo pipefail

base=/srv/dyai/runtime/ana-brain
creds=/etc/dyai/credentials/ana-brain

fail() { echo "brain.sh: $*" >&2; exit 1; }

if [[ "${1:-}" == "--in-unit" ]]; then
  shift
  [[ -n "${CREDENTIALS_DIRECTORY:-}" ]] || fail "--in-unit outside a systemd unit"
  export ANA_DRIVE_SA_KEY_FILE="$CREDENTIALS_DIRECTORY/drive_sa"
  exec /usr/bin/node --env-file="$CREDENTIALS_DIRECTORY/brain_env" dist/cli.js "$@"
fi

[[ "$(id -u)" == 0 ]] || fail "run as root"
[[ $# -ge 1 ]] || fail "usage: brain.sh <ana-brain command> [args]"
[[ "$1" != serve ]] || fail "serve runs only as dyai-ana-brain.service"
# systemd expands $VAR and % specifiers in the command it starts, so neither may reach it; anything else (a title with
# spaces, a comma-separated topic list, umlauts) passes as the one argument it is
for a in "$@"; do [[ "$a" != *[\$%]* && ! "$a" =~ [[:cntrl:]] ]] || fail "argument with \$, % or a control character: $a"; done
[[ -f "$base/current/dist/cli.js" ]] || fail "no current release in $base (release.sh first)"

exec systemd-run --quiet --pipe --wait --collect --service-type=exec \
  --uid=ana-brain --gid=ana-brain \
  -p WorkingDirectory="$base/current" \
  -p LoadCredential=brain_env:"$creds/brain_env" \
  -p LoadCredential=drive_sa:"$creds/drive_sa" \
  -p "Environment=NODE_ENV=production HOST=127.0.0.1 PORT=8790 BRAIN_PUBLIC_URL=https://mcp.ana.dyai.cloud" \
  -p "Environment=BRAIN_VAULT_DIR=/var/lib/ana-brain/vault BRAIN_STATE_DIR=/var/lib/ana-brain/state" \
  -p "Environment=OLLAMA_URL=http://127.0.0.1:11434 QDRANT_URL=http://127.0.0.1:6333" \
  -p UMask=0077 -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes \
  -p "ReadWritePaths=/var/lib/ana-brain/vault /var/lib/ana-brain/state" \
  "$base/brain.sh" --in-unit "$@"
