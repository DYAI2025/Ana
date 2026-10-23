#!/usr/bin/env bash
# ANA LUMEN release and rollback on the Arch host (systemd, no Docker). Run as root, e.g.
#   ssh -t arch sudo /srv/dyai/runtime/ana-dashboard/release.sh <full git sha of main> <dir with the CI bundle>
#   ssh -t arch sudo /srv/dyai/runtime/ana-dashboard/release.sh --rollback
#
# The bundle is ana-dashboard-app-<sha>.tar.gz plus its .sha256 file from the dashboard-image workflow run of that
# main commit: the /app of the image whose access gate CI tested, and which CI also ran under Node 24 (the Arch Node).
#
# A release counts as verified only when /api/healthz answers 200 AND the access gate answers 401 to a request
# without a Cloudflare Access assertion (503 = Access settings missing or wrong) AND the team's signing keys are
# reachable from this host. A wrong but well-formed AUD still passes these checks; only a real login proves it.
# Only verified releases are appended to .release.history, so a failed release can never become a rollback target,
# and a failed release is switched back to the previous one at once. The tunnel is enabled only after the first
# verified release. Safe to re-run after a dropped ssh session: an unpacked release is reused, not unpacked twice.
set -euo pipefail

base=/srv/dyai/runtime/ana-dashboard
creds=/etc/dyai/credentials/ana-dashboard
port=3410
unit=dyai-ana-dashboard.service
tunnel=dyai-ana-tunnel.service

fail() { echo "release: $*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail "run as root"
cd "$base"
exec 9>.release.lock
flock -n 9 || fail "another release.sh is running"

current() { basename "$(readlink current 2>/dev/null || echo none)"; }
code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "http://127.0.0.1:$port$1" || true; }

if [[ "${1:-}" == "--rollback" ]]; then
  cur="$(current)"
  sha="$(tac .release.history 2>/dev/null | grep -vx "$cur" | head -1 || true)"
  [[ -n "$sha" ]] || fail "no verified earlier release in .release.history to roll back to"
  [[ -d "releases/$sha" ]] || fail "release directory releases/$sha is gone"
  echo "rolling back from $cur to $sha"
else
  sha="${1:-}"
  src="${2:-}"
  [[ "$sha" =~ ^[0-9a-f]{40}$ && -n "$src" ]] || fail "usage: release.sh <full git sha> <bundle dir> | --rollback"
fi
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "not a full git sha: $sha"

for f in dashboard_env tunnel_token; do
  [[ -f "$creds/$f" && "$(stat -c '%U:%G:%a' "$creds/$f")" == "root:root:600" ]] || fail "$creds/$f must exist, root:root, mode 600"
done
team="$(sed -n 's/^CF_ACCESS_TEAM_DOMAIN=//p' "$creds/dashboard_env" | tail -1)"
[[ "$team" =~ ^https://[a-z0-9-]+\.cloudflareaccess\.com$ ]] || fail "CF_ACCESS_TEAM_DOMAIN in $creds/dashboard_env must be https://<team>.cloudflareaccess.com"
# (no `curl | grep -q` here: grep closes the pipe early, curl exits 23, pipefail turns a success into a failure)
certs="$(curl -sf -m 10 "$team/cdn-cgi/access/certs" || true)"
[[ "$certs" == *'"keys"'* ]] || fail "the Access signing keys at $team/cdn-cgi/access/certs are not reachable from this host"

if [[ ! -d "releases/$sha" ]]; then
  tarball="$src/ana-dashboard-app-$sha.tar.gz"
  [[ -f "$tarball" && -f "$tarball.sha256" ]] || fail "$tarball and its .sha256 file must exist"
  want="$(awk '{print $1}' "$tarball.sha256")"
  have="$(sha256sum "$tarball" | awk '{print $1}')"
  [[ "$want" =~ ^[0-9a-f]{64}$ && "$want" == "$have" ]] || fail "checksum mismatch for $tarball"
  tmp="$(mktemp -d "releases/.$sha.XXXXXX")"
  tar -xzf "$tarball" -C "$tmp" --no-same-owner --no-same-permissions
  [[ -f "$tmp/server.js" && -f "$tmp/.next/BUILD_ID" ]] || { rm -rf "$tmp"; fail "bundle has no server.js or .next/BUILD_ID"; }
  # Next writes its cache below .next/cache: point it at the unit's CacheDirectory, keep the release itself read-only
  rm -rf "$tmp/.next/cache" && ln -s /var/cache/dyai/ana-dashboard "$tmp/.next/cache"
  chown -R root:root "$tmp" && chmod -R u=rwX,go=rX "$tmp"
  mv -T "$tmp" "releases/$sha"
fi

prev="$(readlink current 2>/dev/null || true)"
switch() { ln -sfn "$1" .current.new && mv -T .current.new current; }
# a release that fails its checks does not stay live: switch back to what ran before (if anything) and restart it
revert() {
  if [[ -n "$prev" && "$prev" != "releases/$sha" ]]; then
    switch "$prev" && systemctl restart "$unit" && echo "release: switched back to $(basename "$prev")" >&2
  else
    systemctl stop "$tunnel" "$unit" && echo "release: no earlier release to switch back to; dashboard and tunnel stopped" >&2
  fi
  fail "$1"
}

switch "releases/$sha"
{ systemctl enable "$unit" >/dev/null && systemctl restart "$unit"; } || revert "systemd could not start $unit for $sha"

health=""
for _ in $(seq 45); do
  health="$(code /api/healthz)"
  [[ "$health" == 200 ]] && break
  sleep 2
done
[[ "$health" == 200 ]] || revert "release $sha did not become healthy (last /api/healthz: ${health:-none})"

gate="$(code /)"
[[ "$gate" == 401 ]] || revert "access gate of $sha answered '${gate:-nothing}' instead of 401 (503 = Access settings missing or wrong)"

systemctl enable --now "$tunnel" || fail "systemd could not start $tunnel (dashboard $sha is verified and running)"
[[ "$(tail -1 .release.history 2>/dev/null || true)" == "$sha" ]] || printf '%s\n' "$sha" >> .release.history
echo "release: ana-dashboard $sha verified (healthz 200, access gate 401 without assertion, Access keys reachable); tunnel enabled"
