#!/usr/bin/env bash
# ANA LUMEN release and rollback on the Contabo VPS vmi3693936 (Ubuntu 24.04, systemd, no Docker). Run as root,
# detached from the ssh session so that a dropped connection cannot stop it half way, e.g. (<contabo> = the
# operator's SSH target for vmi3693936, see README.md section 4)
#   ssh -t <contabo> systemd-run --unit=ana-release --wait --collect /srv/dyai/runtime/ana-dashboard/release.sh <sha> <dir>
#   ssh -t <contabo> systemd-run --unit=ana-release --wait --collect /srv/dyai/runtime/ana-dashboard/release.sh --rollback
#   ssh <contabo> journalctl -u ana-release -o cat -n 50
#
# The bundle is ana-dashboard-app-<sha>.tar.gz plus its .sha256 file from the dashboard-image workflow run of that
# main commit: the /app of the image whose access gate CI tested, and which CI also ran under Node v24.22.0 (the host's Node).
#
# A release counts as verified only when the team's Access signing keys are reachable from this host, the unit is
# active, /api/healthz answers 200 from the unit's own process AND the access gate answers 401 to a request without
# a Cloudflare Access assertion (503 = Access settings missing or wrong). A wrong but well-formed AUD still passes
# these checks; only a real login proves it. Only verified releases are appended to .release.history. A failing
# release is replaced at once by the newest verified release in the history, which is checked the same way; with none
# (or if that fails too) dashboard and tunnel are disabled and the script says so. The tunnel is enabled only after a
# verified release and must report a connection. Re-running with the same sha reuses the unpacked release.
set -euo pipefail

base=/srv/dyai/runtime/ana-dashboard
creds=/etc/dyai/credentials/ana-dashboard
port=3410
unit=dyai-ana-dashboard.service
tunnel=dyai-ana-tunnel.service

fail() { echo "release: $*" >&2; exit 1; }
# --- bundle checksum and provenance (README section 1, invariant 1) -------------------------------------------------
# A bundle is released only if it came from a successful push run of the dashboard-image workflow on main for exactly this
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
  for kv in repository=DYAI2025/Ana workflow=.github/workflows/dashboard-image.yml event=push ref=refs/heads/main "sha=$s"; do
    k="${kv%%=*}" v="${kv#*=}"
    [[ "$(printf '%s\n' "$info" | grep -c "^$k=")" == 1 && "$(printf '%s\n' "$info" | sed -n "s/^$k=//p")" == "$v" ]] ||
      { echo "provenance: $k is '$(printf '%s\n' "$info" | sed -n "s/^$k=//p" | head -1)', expected '$v' (release only push runs of dashboard-image on main)"; return 1; }
  done
  printf '%s\n' "$info" | grep -qE '^run_id=[0-9]+$' || { echo "provenance: no run_id"; return 1; }
}

# check a bundle without touching the host (as CI does with deploy/test-release-provenance.sh):
#   release.sh --check-bundle <sha> <bundle dir>
if [[ "${1:-}" == "--check-bundle" ]]; then
  [[ "${2:-}" =~ ^[0-9a-f]{40}$ && -n "${3:-}" ]] || fail "usage: release.sh --check-bundle <full git sha> <bundle dir>"
  why="$(check_bundle "$2" "$3/ana-dashboard-app-$2.tar.gz")" || fail "$why"
  echo "release: bundle ana-dashboard-app-$2.tar.gz: checksum ok, push run $(tar -xzOf "$3/ana-dashboard-app-$2.tar.gz" ./.ana-build | sed -n 's/^run_id=//p') of dashboard-image on main"
  exit 0
fi

[[ "$(id -u)" == 0 ]] || fail "run as root"
cd "$base"
exec 9>.release.lock
flock -n 9 || fail "another release.sh is running"

code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "http://127.0.0.1:$port$1" || true; }
# newest verified release other than $1 whose directory still exists
last_verified_except() {
  local s
  for s in $(tac .release.history 2>/dev/null || true); do
    [[ "$s" != "$1" && -d "releases/$s" ]] && { echo "$s"; return 0; }
  done
  return 0
}

if [[ "${1:-}" == "--rollback" ]]; then
  cur="$(basename "$(readlink current 2>/dev/null || echo none)")"
  # each rollback appends its target to the history, so a second --rollback returns to the release just left
  sha="$(last_verified_except "$cur")"
  [[ -n "$sha" ]] || fail "no verified earlier release in .release.history to roll back to"
  echo "rolling back from $cur to $sha"
else
  sha="${1:-}"
  src="${2:-}"
  [[ "$sha" =~ ^[0-9a-f]{40}$ && -n "$src" ]] || fail "usage: release.sh <full git sha> <bundle dir> | --rollback"
fi
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "not a full git sha: $sha"

for f in dashboard_env tunnel_token; do
  [[ -s "$creds/$f" && "$(stat -c '%U:%G:%a' "$creds/$f")" == "root:root:600" ]] || fail "$creds/$f must exist, be non-empty, root:root, mode 600"
done
team="$(sed -n 's/^CF_ACCESS_TEAM_DOMAIN=//p' "$creds/dashboard_env" | tail -1)"
[[ "$team" =~ ^https://[a-z0-9-]+\.cloudflareaccess\.com$ ]] || fail "CF_ACCESS_TEAM_DOMAIN in $creds/dashboard_env must be https://<team>.cloudflareaccess.com"
# (no `curl | grep -q` here: grep closes the pipe early, curl exits 23, pipefail turns a success into a failure)
certs="$(curl -sf -m 10 "$team/cdn-cgi/access/certs" || true)"
[[ "$certs" == *'"keys"'* ]] || fail "the Access signing keys at $team/cdn-cgi/access/certs are not reachable from this host"

if [[ ! -d "releases/$sha" ]]; then
  tarball="$src/ana-dashboard-app-$sha.tar.gz"
  why="$(check_bundle "$sha" "$tarball")" || fail "$why"
  tmp="$(mktemp -d "releases/.$sha.XXXXXX")"
  bad() { rm -rf "$tmp"; fail "$1"; }
  tar -xzf "$tarball" -C "$tmp" --no-same-owner --no-same-permissions || bad "bundle could not be unpacked"
  [[ -f "$tmp/server.js" && -f "$tmp/.next/BUILD_ID" && ! -L "$tmp/.next" ]] || bad "bundle has no server.js or .next/BUILD_ID"
  while IFS= read -r -d '' link; do
    target="$(realpath -m "$link")"
    [[ "$target" == "$(realpath "$tmp")"/* ]] || bad "bundle contains a symlink that leaves the release: ${link#"$tmp"/}"
  done < <(find "$tmp" -type l -print0)
  # Next writes its cache below .next/cache: point it at the unit's CacheDirectory, keep the release itself read-only
  rm -rf "$tmp/.next/cache" || bad "could not prepare .next/cache"
  ln -s /var/cache/dyai/ana-dashboard "$tmp/.next/cache" || bad "could not link .next/cache"
  chown -R root:root "$tmp" || bad "could not chown the release"
  chmod -R u=rwX,go=rX "$tmp" || bad "could not chmod the release"
  mv -T "$tmp" "releases/$sha"
fi

switch() { ln -sfn "releases/$1" .current.new && mv -T .current.new current; }

# start the unit on releases/$1 and check it; prints why it failed, returns non-zero on failure
start_and_check() {
  local s=$1 health="" gate pid
  switch "$s" || { echo "could not switch current to $s"; return 1; }
  systemctl reset-failed "$unit" 2>/dev/null || true # a crash loop of the previous attempt must not block this start
  systemctl enable "$unit" >/dev/null || { echo "could not enable $unit"; return 1; }
  systemctl restart "$unit" || { echo "systemd could not start $unit"; return 1; }
  for _ in $(seq 45); do
    health="$(code /api/healthz)"
    [[ "$health" == 200 ]] && break
    sleep 2
  done
  [[ "$health" == 200 ]] || { echo "$s did not become healthy (last /api/healthz: ${health:-none})"; return 1; }
  systemctl is-active --quiet "$unit" || { echo "$unit is not active although something answers on $port"; return 1; }
  pid="$(systemctl show -p MainPID --value "$unit")"
  ss -ltnpH "sport = :$port" | grep -q "pid=$pid," || { echo "port $port is not served by $unit (pid $pid)"; return 1; }
  gate="$(code /)"
  [[ "$gate" == 401 ]] || { echo "access gate of $s answered '${gate:-nothing}' instead of 401 (503 = Access settings missing or wrong)"; return 1; }
}

if ! why="$(start_and_check "$sha")"; then
  prev="$(last_verified_except "$sha")"
  if [[ -n "$prev" ]] && why_prev="$(start_and_check "$prev")"; then
    fail "$why; switched back to verified release $prev (healthz 200, gate 401); the tunnel still serves it"
  fi
  systemctl disable --now "$tunnel" "$unit" >/dev/null 2>&1 || true
  rm -f current
  fail "$why; ${prev:+switching back to $prev failed too (${why_prev:-}); }SITE DOWN: dashboard and tunnel disabled"
fi

systemctl reset-failed "$tunnel" 2>/dev/null || true
systemctl enable --now "$tunnel" || fail "systemd could not start $tunnel (dashboard $sha is verified and running)"
ready=""
for _ in $(seq 30); do
  ready="$(curl -sf -m 5 "http://127.0.0.1:20242/ready" || true)"
  [[ "$ready" =~ \"readyConnections\":[1-9] ]] && break
  sleep 2
done
[[ "$ready" =~ \"readyConnections\":[1-9] ]] || fail "dashboard $sha is verified and running, but the tunnel did not connect (check tunnel_token; journalctl -u $tunnel)"
[[ "$(tail -1 .release.history 2>/dev/null || true)" == "$sha" ]] || printf '%s\n' "$sha" >> .release.history
echo "release: ana-dashboard $sha verified (healthz 200, access gate 401 without assertion, Access keys reachable); tunnel connected"
