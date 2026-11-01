#!/usr/bin/env bash
# ANA Brain release and rollback on the Contabo VPS vmi3693936 (Ubuntu 24.04, systemd, no Docker). Run as root,
# detached from the ssh session so that a dropped connection cannot stop it half way (<contabo> = the operator's SSH
# target for vmi3693936, README.md section 4):
#   ssh -t <contabo> systemd-run --unit=ana-brain-release --wait --collect /srv/dyai/runtime/ana-brain/release.sh <sha> <dir>
#   ssh -t <contabo> systemd-run --unit=ana-brain-release --wait --collect /srv/dyai/runtime/ana-brain/release.sh --rollback
#   ssh <contabo> journalctl -u ana-brain-release -o cat -n 50
#
# The bundle is ana-brain-app-<sha>.tar.gz plus its .sha256 file from the brain workflow run of that main commit: the
# built dist/ with its production node_modules, which CI started under Node v24.22.0 (the host's Node) and whose
# auth gates it tested.
#
# A release counts as verified only when Qdrant and Ollama listen on loopback only, Qdrant refuses a request without
# its API key and accepts the Brain's, the embedding model is present, and the Brain unit is active, owns
# 127.0.0.1:8790 (and nothing else listens on 8790), answers /healthz 200 and refuses /mcp and /projection without a
# credential (401). Only verified releases are appended to .release.history; then the index and backup timers are
# enabled. A failing release is replaced at once by the newest verified release, checked the same way; with none (or if
# that fails too) the Brain and its timers are stopped and the script says so. nginx is not touched (README section 4).
set -euo pipefail

base=/srv/dyai/runtime/ana-brain
creds=/etc/dyai/credentials/ana-brain
port=8790
unit=dyai-ana-brain.service
timers=(dyai-ana-brain-index.timer dyai-ana-brain-backup.timer)
model=bge-m3

fail() { echo "release: $*" >&2; exit 1; }
# --- bundle checksum and provenance (README section 1, invariant 1) -------------------------------------------------
# A bundle is released only if it came from a successful push run of the brain workflow on main for exactly this
# commit. deploy/fetch-release.sh checks that run against the GitHub API on the operator's machine before download;
# here the host checks what the run wrote into the bundle itself (.ana-build, covered by the .sha256): a pull_request
# or workflow_dispatch artifact, a run on another branch, repository or workflow, or a renamed bundle of another commit
# is refused even when its file name is a bare 40-hex commit. The file is written by the run that built the bundle, so
# it guards against a wrong or renamed artifact, not against a forged one; the API check covers the run itself.
check_bundle() {
  local s=$1 tarball=$2 want have info kv k v
  [[ -f "$tarball" && -f "$tarball.sha256" ]] || { echo "$tarball and its .sha256 file must exist"; return 1; }
  want="$(awk '{print $1}' "$tarball.sha256")"
  have="$(sha256sum "$tarball" | awk '{print $1}')"
  [[ "$want" =~ ^[0-9a-f]{64}$ && "$want" == "$have" ]] || { echo "checksum mismatch for $tarball"; return 1; }
  info="$(tar -xzOf "$tarball" ./.ana-build 2>/dev/null)" || { echo "$tarball has no .ana-build: not a bundle of a push run on main"; return 1; }
  for kv in repository=DYAI2025/Ana workflow=.github/workflows/brain.yml event=push ref=refs/heads/main "sha=$s"; do
    k="${kv%%=*}" v="${kv#*=}"
    [[ "$(printf '%s\n' "$info" | grep -c "^$k=")" == 1 && "$(printf '%s\n' "$info" | sed -n "s/^$k=//p")" == "$v" ]] ||
      { echo "provenance: $k is '$(printf '%s\n' "$info" | sed -n "s/^$k=//p" | head -1)', expected '$v' (release only push runs of brain on main)"; return 1; }
  done
  printf '%s\n' "$info" | grep -qE '^run_id=[0-9]+$' || { echo "provenance: no run_id"; return 1; }
}

# check a bundle without touching the host (as CI does with deploy/test-release-provenance.sh):
#   release.sh --check-bundle <sha> <bundle dir>
if [[ "${1:-}" == "--check-bundle" ]]; then
  [[ "${2:-}" =~ ^[0-9a-f]{40}$ && -n "${3:-}" ]] || fail "usage: release.sh --check-bundle <full git sha> <bundle dir>"
  why="$(check_bundle "$2" "$3/ana-brain-app-$2.tar.gz")" || fail "$why"
  echo "release: bundle ana-brain-app-$2.tar.gz: checksum ok, push run $(tar -xzOf "$3/ana-brain-app-$2.tar.gz" ./.ana-build | sed -n 's/^run_id=//p') of brain on main"
  exit 0
fi

[[ "$(id -u)" == 0 ]] || fail "run as root"
cd "$base"
exec 9>.release.lock
flock -n 9 || fail "another release.sh is running"

code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@" || true; }
# every listening socket on a port must be bound to 127.0.0.1 (and at least one must exist)
loopback_only() {
  local addrs
  addrs="$(ss -ltnH "sport = :$1" | awk '{print $4}')"
  [[ -n "$addrs" ]] || { echo "nothing listens on port $1"; return 1; }
  while read -r a; do
    [[ "$a" == "127.0.0.1:$1" ]] || { echo "port $1 is bound to $a, not only 127.0.0.1"; return 1; }
  done <<< "$addrs"
}
last_verified_except() {
  local s
  for s in $(tac .release.history 2>/dev/null || true); do
    [[ "$s" != "$1" && -d "releases/$s" ]] && { echo "$s"; return 0; }
  done
  return 0
}

if [[ "${1:-}" == "--rollback" ]]; then
  cur="$(basename "$(readlink current 2>/dev/null || echo none)")"
  sha="$(last_verified_except "$cur")"
  [[ -n "$sha" ]] || fail "no verified earlier release in .release.history to roll back to"
  echo "rolling back from $cur to $sha"
else
  sha="${1:-}"
  src="${2:-}"
  [[ "$sha" =~ ^[0-9a-f]{40}$ && -n "$src" ]] || fail "usage: release.sh <full git sha> <bundle dir> | --rollback"
fi
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "not a full git sha: $sha"

# --- host preconditions (README section 4): credentials, data, no legacy Drive credential ---------------------------
for f in brain_env qdrant_api_key drive_sa; do
  [[ -f "$creds/$f" && "$(stat -c '%U:%G:%a' "$creds/$f")" == "root:root:600" ]] || fail "$creds/$f must exist, root:root, mode 600"
done
[[ -s "$creds/brain_env" && -s "$creds/qdrant_api_key" ]] || fail "brain_env and qdrant_api_key must not be empty"
qkey="$(tr -d '\n' < "$creds/qdrant_api_key")"
envkey="$(sed -n 's/^QDRANT_API_KEY=//p' "$creds/brain_env" | tail -1)"
[[ ${#qkey} -ge 32 && "$qkey" =~ ^[A-Za-z0-9._~-]+$ && "$qkey" == "$envkey" ]] ||
  fail "QDRANT_API_KEY in brain_env must equal qdrant_api_key (at least 32 characters of [A-Za-z0-9._~-], e.g. openssl rand -hex 32)"
root_id="$(sed -n 's/^ANA_DRIVE_ROOT_ID=//p' "$creds/brain_env" | tail -1)"
if [[ -n "$root_id" ]]; then
  grep -q '"type": *"service_account"' "$creds/drive_sa" || fail "ANA_DRIVE_ROOT_ID is set but drive_sa is not a service-account key"
fi
# the personal Drive OAuth credential of the legacy host never comes here (PO decision ANA35-HOST-002)
for f in /etc/ana-brain/drive-oauth.json /var/lib/ana-brain/state/drive-oauth.json "$creds/drive-oauth.json"; do
  [[ ! -e "$f" ]] || fail "$f exists: the legacy personal Drive credential must not be on this host"
done
id ana-brain >/dev/null 2>&1 || fail "user ana-brain does not exist"
for d in /var/lib/ana-brain/vault /var/lib/ana-brain/state; do
  [[ -d "$d" && "$(stat -c '%U:%G' "$d")" == "ana-brain:ana-brain" ]] || fail "$d must exist, owned by ana-brain:ana-brain"
done
[[ -d /var/lib/ana-brain/vault/.git ]] || fail "/var/lib/ana-brain/vault is not the restored git vault"

# --- Qdrant and Ollama: loopback only, key enforced, model present ---------------------------------------------------
why="$(loopback_only 6333)" || fail "qdrant: $why"
[[ -z "$(ss -ltnH 'sport = :6334')" ]] || fail "qdrant: gRPC port 6334 listens (config.yaml must keep grpc_port: null)"
why="$(loopback_only 11434)" || fail "ollama: $why"
nokey="$(code http://127.0.0.1:6333/collections)"
[[ "$nokey" == 401 || "$nokey" == 403 ]] || fail "qdrant answered '$nokey' to /collections without its API key (expected 401/403)"
# the key goes to curl as a config on stdin (printf is a builtin): in argv it would be readable in /proc/<pid>/cmdline
[[ "$(printf 'header = "api-key: %s"\n' "$qkey" | code -K - http://127.0.0.1:6333/collections)" == 200 ]] || fail "qdrant refuses the Brain's API key"
tags="$(curl -sf -m 10 http://127.0.0.1:11434/api/tags || true)"
[[ "$tags" == *"\"$model:"* ]] || fail "ollama: model $model is not present (pull it through the loopback API, README section 4)"

if [[ ! -d "releases/$sha" ]]; then
  tarball="$src/ana-brain-app-$sha.tar.gz"
  why="$(check_bundle "$sha" "$tarball")" || fail "$why"
  mkdir -p releases
  tmp="$(mktemp -d "releases/.$sha.XXXXXX")"
  bad() { rm -rf "$tmp"; fail "$1"; }
  tar -xzf "$tarball" -C "$tmp" --no-same-owner --no-same-permissions || bad "bundle could not be unpacked"
  [[ -f "$tmp/dist/cli.js" && -f "$tmp/package.json" && -d "$tmp/node_modules" ]] || bad "bundle has no dist/cli.js, package.json or node_modules"
  while IFS= read -r -d '' link; do
    target="$(realpath -m "$link")"
    [[ "$target" == "$(realpath "$tmp")"/* ]] || bad "bundle contains a symlink that leaves the release: ${link#"$tmp"/}"
  done < <(find "$tmp" -type l -print0)
  chown -R root:root "$tmp" || bad "could not chown the release"
  chmod -R u=rwX,go=rX "$tmp" || bad "could not chmod the release"
  mv -T "$tmp" "releases/$sha"
fi

switch() { ln -sfn "releases/$1" .current.new && mv -T .current.new current; }

start_and_check() {
  local s=$1 health="" pid
  switch "$s" || { echo "could not switch current to $s"; return 1; }
  systemctl reset-failed "$unit" 2>/dev/null || true
  systemctl enable "$unit" >/dev/null || { echo "could not enable $unit"; return 1; }
  systemctl restart "$unit" || { echo "systemd could not start $unit"; return 1; }
  for _ in $(seq 30); do
    health="$(code "http://127.0.0.1:$port/healthz")"
    [[ "$health" == 200 ]] && break
    sleep 2
  done
  [[ "$health" == 200 ]] || { echo "$s did not become healthy (last /healthz: ${health:-none})"; return 1; }
  systemctl is-active --quiet "$unit" || { echo "$unit is not active although something answers on $port"; return 1; }
  pid="$(systemctl show -p MainPID --value "$unit")"
  ss -ltnpH "sport = :$port" | grep -q "pid=$pid," || { echo "port $port is not served by $unit (pid $pid)"; return 1; }
  loopback_only "$port" || return 1
  local mcp proj
  mcp="$(code -X POST -H 'content-type: application/json' -d '{}' "http://127.0.0.1:$port/mcp")"
  [[ "$mcp" == 401 ]] || { echo "/mcp of $s answered '${mcp:-nothing}' without a key instead of 401"; return 1; }
  proj="$(code "http://127.0.0.1:$port/projection")"
  [[ "$proj" == 401 ]] || { echo "/projection of $s answered '${proj:-nothing}' without a token instead of 401"; return 1; }
}

if ! why="$(start_and_check "$sha")"; then
  prev="$(last_verified_except "$sha")"
  if [[ -n "$prev" ]] && why_prev="$(start_and_check "$prev")"; then
    fail "$why; switched back to verified release $prev (healthz 200, /mcp and /projection 401)"
  fi
  systemctl disable --now "${timers[@]}" "$unit" >/dev/null 2>&1 || true
  rm -f current
  fail "$why; ${prev:+switching back to $prev failed too (${why_prev:-}); }BRAIN DOWN: $unit and its timers disabled"
fi

systemctl enable --now "${timers[@]}" >/dev/null || fail "Brain $sha is verified and running, but its timers could not be enabled"
[[ "$(tail -1 .release.history 2>/dev/null || true)" == "$sha" ]] || printf '%s\n' "$sha" >> .release.history
echo "release: ana-brain $sha verified (qdrant, ollama and brain on loopback only; qdrant key enforced; $model present; healthz 200; /mcp and /projection 401); index and backup timers enabled"
