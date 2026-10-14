#!/usr/bin/env bash
# ANA LUMEN release and rollback on the VPS (Linux: GNU stat). Run as root from /opt/ana-dashboard.
#
#   ./release.sh <full git sha>   switch to ana-dashboard:<sha> (already loaded with `docker load`)
#   ./release.sh --rollback       switch to the most recent VERIFIED release other than the current one
#
# A release counts as verified only when the container is healthy AND the access gate answers 401 to a request
# without a Cloudflare Access assertion (503 would mean the Access settings are missing or wrong). Only verified
# releases are appended to .release.history, so a failed release can never become a rollback target.
set -euo pipefail
cd "$(dirname "$0")"

fail() { echo "release: $*" >&2; exit 1; }

current() { sed -n 's/^ANA_RELEASE=//p' .env 2>/dev/null | tail -1; }

if [[ "${1:-}" == "--rollback" ]]; then
  cur="$(current)"
  sha="$(tac .release.history 2>/dev/null | grep -vx "${cur:-none}" | head -1 || true)"
  [[ -n "$sha" ]] || fail "no verified earlier release in .release.history to roll back to"
  echo "rolling back from ${cur:-none} to $sha"
else
  sha="${1:-}"
fi
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "usage: release.sh <full git sha> | --rollback"
docker image inspect "ana-dashboard:$sha" >/dev/null 2>&1 || fail "image ana-dashboard:$sha is not loaded (docker load first)"
for f in dashboard.env tunnel.env; do
  [[ -f "$f" && "$(stat -c '%U:%a' "$f")" == "root:600" ]] || fail "$f must exist, root-owned, mode 600"
done

# switch ANA_RELEASE atomically, keeping any other lines of .env
tmp="$(mktemp .env.XXXXXX)"
{ grep -v '^ANA_RELEASE=' .env 2>/dev/null || true; printf 'ANA_RELEASE=%s\n' "$sha"; } > "$tmp"
chmod 600 "$tmp" && mv "$tmp" .env

hint="roll back with: ./release.sh --rollback"
docker compose up -d --force-recreate dashboard || fail "docker compose could not start ana-dashboard:$sha; $hint"

state=""
for _ in $(seq 45); do
  cid="$(docker compose ps -q dashboard 2>/dev/null || true)"
  state="$( [[ -n "$cid" ]] && docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
  [[ "$state" == healthy ]] && break
  sleep 2
done
[[ "$state" == healthy ]] || fail "ana-dashboard:$sha did not become healthy (last state: ${state:-none}); $hint"

gate="$(docker compose exec -T dashboard node -e "fetch('http://127.0.0.1:3000/').then(r=>console.log(r.status),()=>console.log('error'))" 2>/dev/null || true)"
[[ "$gate" == 401 ]] || fail "access gate answered '${gate:-nothing}' instead of 401 (503 = Access settings missing or wrong); $hint"

docker compose up -d tunnel || fail "docker compose could not start the tunnel; $hint"
[[ "$(tail -1 .release.history 2>/dev/null || true)" == "$sha" ]] || printf '%s\n' "$sha" >> .release.history
echo "release: ana-dashboard:$sha verified (healthy, access gate 401 without assertion)"
