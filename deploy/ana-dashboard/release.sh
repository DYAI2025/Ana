#!/usr/bin/env bash
# Switch /opt/ana-dashboard to the image built from <sha> (already loaded with `docker load`) and wait until it is
# healthy. Run on the VPS as root from /opt/ana-dashboard. Also the rollback: `./release.sh "$(cat .release.previous)"`.
# The previous release is recorded only when the release actually changes, so re-running the same release keeps it.
set -euo pipefail
cd "$(dirname "$0")"
sha="${1:?usage: release.sh <full git sha>}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "not a full git sha: $sha" >&2; exit 2; }
docker image inspect "ana-dashboard:$sha" >/dev/null || { echo "image ana-dashboard:$sha is not loaded" >&2; exit 3; }
for f in dashboard.env tunnel.env; do
  [[ "$(stat -c '%U:%a' "$f")" == "root:600" ]] || { echo "$f must be root-owned, mode 600" >&2; exit 4; }
done

current="$(sed -n 's/^ANA_RELEASE=//p' .env 2>/dev/null || true)"
if [[ "$current" != "$sha" ]]; then
  [[ -n "$current" ]] && printf '%s\n' "$current" > .release.previous
  printf 'ANA_RELEASE=%s\n' "$sha" > .env
fi

docker compose up -d
for _ in $(seq 45); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q dashboard)")"
  [[ "$state" == healthy ]] && { echo "ana-dashboard:$sha healthy (previous: $(cat .release.previous 2>/dev/null || echo none))"; exit 0; }
  sleep 2
done
echo "ana-dashboard:$sha did not become healthy; roll back with ./release.sh \"\$(cat .release.previous)\"" >&2
exit 1
