#!/usr/bin/env bash
# CI test of the release provenance rule (deploy/ana-dashboard and deploy/ana-brain README section 1, invariant 1):
# only a bundle from a successful push run of its workflow on main for that commit can be released, whatever its name.
#   deploy/test-release-provenance.sh            (from the repository root; no root, no network, no GitHub access)
# Proves, for both kits:
#   - the workflows name outputs with a bare commit only on a push to main and keep test output 3 days (pinned lines);
#   - release.sh --check-bundle accepts a push-to-main bundle and refuses the canaries: a pull_request bundle renamed to
#     the bare commit, a workflow_dispatch bundle, a push on another branch, the other kit's bundle, another commit's
#     bundle, a bundle without .ana-build (all artifacts made before this rule), a duplicated field, a bad checksum;
#   - fetch-release.sh (against a stub gh) accepts only a successful push run on main of the right workflow and repo
#     whose artifact names that run.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
t="$(mktemp -d)"
trap 'rm -rf "$t"' EXIT
n=0
fail() { echo "FAIL: $*"; exit 1; }
ok() { n=$((n + 1)); echo "ok: $*"; }
SHA=1111111111111111111111111111111111111111
OTHER=2222222222222222222222222222222222222222
RUN=987654321

# --- the workflows: release-shaped names and long retention only for a push to main --------------------------------
out_id="  OUT_ID: \${{ (github.event_name == 'push' && github.ref == 'refs/heads/main') && github.sha || format('{0}-{1}', github.event_name == 'pull_request' && 'pr' || 'test', github.event.pull_request.head.sha || github.sha) }}"
retention="  RETENTION_DAYS: \${{ (github.event_name == 'push' && github.ref == 'refs/heads/main') && 30 || 3 }}"
for pair in dashboard:dashboard-image brain:brain; do
  kind="${pair%%:*}" wf="$root/.github/workflows/${pair#*:}.yml"
  [ "$(grep -cxF "$out_id" "$wf")" = 1 ] || fail "$wf: OUT_ID line changed (only a push to main may get a bare commit name)"
  [ "$(grep -cE '^[[:space:]]*OUT_ID:' "$wf")" = 1 ] || fail "$wf: OUT_ID set more than once"
  [ "$(grep -cxF "$retention" "$wf")" = 1 ] || fail "$wf: RETENTION_DAYS line changed"
  [ "$(grep -c 'actions/upload-artifact@' "$wf")" = 1 ] || fail "$wf: expected exactly one upload-artifact step"
  grep -qxF "          name: ana-$kind-\${{ env.OUT_ID }}" "$wf" || fail "$wf: artifact is not named ana-$kind-\${{ env.OUT_ID }}"
  [ "$(grep -cE '^[[:space:]]*retention-days:' "$wf")" = 1 ] && grep -qxF '          retention-days: ${{ env.RETENTION_DAYS }}' "$wf" ||
    fail "$wf: retention-days is not \${{ env.RETENTION_DAYS }}"
  grep -qF 'name: Output name matches the event' "$wf" || fail "$wf: run-time name guard missing"
  grep -qF '"event=$GITHUB_EVENT_NAME"' "$wf" && grep -qF '> bundle/.ana-build' "$wf" || fail "$wf: bundle no longer records its provenance"
  ok "$wf: bare-commit name and 30-day retention only on push to main, guard and .ana-build present"
done

# --- release.sh --check-bundle -----------------------------------------------------------------------------------
# bundle <dir> <kind> <name sha> [.ana-build lines...]: writes ana-<kind>-app-<name sha>.tar.gz and its .sha256
bundle() {
  local d=$1 kind=$2 s=$3; shift 3
  rm -rf "$d" && mkdir -p "$d/b" && echo app > "$d/b/server.js"
  [ "$#" = 0 ] || printf '%s\n' "$@" > "$d/b/.ana-build"
  tar -C "$d/b" -czf "$d/ana-$kind-app-$s.tar.gz" . && rm -rf "$d/b"
  (cd "$d" && sha256sum "ana-$kind-app-$s.tar.gz" > "ana-$kind-app-$s.tar.gz.sha256")
}
build() { # build <workflow file> <event> <ref> <sha>
  printf '%s\n' repository=DYAI2025/Ana "workflow=.github/workflows/$1" "event=$2" "ref=$3" "sha=$4" "run_id=$RUN" run_attempt=1
}
check() { bash "$root/deploy/ana-$1/release.sh" --check-bundle "$2" "$3" > "$t/out" 2>&1; }
refuse() { # refuse <kind> <sha> <dir> <what> <expected message part>
  if check "$1" "$2" "$3"; then cat "$t/out"; fail "$1 release.sh accepted $4"; fi
  grep -qF "$5" "$t/out" || { cat "$t/out"; fail "$1 release.sh refused $4 for another reason"; }
  ok "$1 release.sh refuses $4: $(cat "$t/out")"
}
for pair in dashboard:dashboard-image.yml brain:brain.yml; do
  kind="${pair%%:*}" wf="${pair#*:}" other_wf=brain.yml
  [ "$kind" = brain ] && other_wf=dashboard-image.yml
  d="$t/$kind"
  mapfile -t good < <(build "$wf" push refs/heads/main "$SHA")
  bundle "$d" "$kind" "$SHA" "${good[@]}"
  check "$kind" "$SHA" "$d" || { cat "$t/out"; fail "$kind release.sh refused a push-to-main bundle"; }
  ok "$kind release.sh accepts the push-to-main bundle: $(cat "$t/out")"
  # canary: the shape of the 21 + 8 pull_request artifacts of the 2026-10-31 inventory, renamed to the bare commit
  mapfile -t b < <(build "$wf" pull_request refs/pull/13/merge "$SHA"); bundle "$d" "$kind" "$SHA" "${b[@]}"
  refuse "$kind" "$SHA" "$d" "a pull_request bundle named like a release" "event is 'pull_request'"
  mapfile -t b < <(build "$wf" workflow_dispatch refs/heads/main "$SHA"); bundle "$d" "$kind" "$SHA" "${b[@]}"
  refuse "$kind" "$SHA" "$d" "a workflow_dispatch bundle" "event is 'workflow_dispatch'"
  mapfile -t b < <(build "$wf" push refs/heads/feature "$SHA"); bundle "$d" "$kind" "$SHA" "${b[@]}"
  refuse "$kind" "$SHA" "$d" "a push on another branch" "ref is 'refs/heads/feature'"
  mapfile -t b < <(build "$other_wf" push refs/heads/main "$SHA"); bundle "$d" "$kind" "$SHA" "${b[@]}"
  refuse "$kind" "$SHA" "$d" "the other kit's bundle" "workflow is"
  mapfile -t b < <(build "$wf" push refs/heads/main "$OTHER"); bundle "$d" "$kind" "$SHA" "${b[@]}"
  refuse "$kind" "$SHA" "$d" "another commit's bundle renamed" "sha is '$OTHER'"
  bundle "$d" "$kind" "$SHA"
  refuse "$kind" "$SHA" "$d" "a bundle without .ana-build" "has no .ana-build"
  bundle "$d" "$kind" "$SHA" event=pull_request "${good[@]}"
  refuse "$kind" "$SHA" "$d" "a bundle with a second event line" "event is"
  bundle "$d" "$kind" "$SHA" "${good[@]}"; echo x >> "$d/ana-$kind-app-$SHA.tar.gz"
  refuse "$kind" "$SHA" "$d" "a bundle whose checksum does not match" "checksum mismatch"
  bundle "$d" "$kind" "pr-$SHA" "${good[@]}"
  refuse "$kind" "pr-$SHA" "$d" "a pr- name" "usage:"
done

# --- fetch-release.sh against a stub gh --------------------------------------------------------------------------
stub="$t/gh"
cat > "$stub" <<'EOF'
#!/usr/bin/env bash
# stub of gh: api <path> [... --jq q] answers from $FIX/<runs|run|artifacts>.json; run download copies $FIX/artifact/*
set -euo pipefail
if [ "$1" = run ] && [ "$2" = download ]; then
  while [ "$#" -gt 0 ]; do [ "$1" = -D ] && dest=$2; shift; done
  cp "$FIX"/artifact/* "$dest"/; exit 0
fi
[ "$1" = api ] || exit 2
q=. f=
for a in "$@"; do
  case "$a" in
    */workflows/*/runs) f=runs ;;
    */runs/*/artifacts) f=artifacts ;;
    repos/*/actions/runs/*) f=run ;;
  esac
done
while [ "$#" -gt 0 ]; do [ "$1" = --jq ] && q=$2; shift; done
jq -r "$q" "$FIX/$f.json"
EOF
chmod +x "$stub"
run_json() { # run_json <event> <branch> <conclusion> <workflow> <head repo>
  printf '{"id":%s,"event":"%s","head_branch":"%s","head_sha":"%s","status":"completed","conclusion":"%s","path":".github/workflows/%s","repository":{"full_name":"DYAI2025/Ana"},"head_repository":{"full_name":"%s"}}\n' \
    "$RUN" "$1" "$2" "$SHA" "$3" "$4" "$5"
}
for pair in dashboard:dashboard-image.yml brain:brain.yml; do
  kind="${pair%%:*}" wf="${pair#*:}"
  export FIX="$t/fix-$kind"
  mkdir -p "$FIX"
  setup() { # setup <run json> <artifact name> <.ana-build run_id>
    printf '{"workflow_runs":[{"id":%s}]}\n' "$RUN" > "$FIX/runs.json"
    echo "$1" > "$FIX/run.json"
    printf '{"artifacts":[{"id":5,"name":"%s","expired":false}]}\n' "$2" > "$FIX/artifacts.json"
    mapfile -t b < <(build "$wf" push refs/heads/main "$SHA" | sed "s/^run_id=.*/run_id=$3/")
    bundle "$FIX/artifact" "$kind" "$SHA" "${b[@]}"
  }
  fetch() { rm -rf "$t/dl"; GH="$stub" bash "$root/deploy/fetch-release.sh" "$kind" "$SHA" "$t/dl" > "$t/out" 2>&1; }
  fetch_refuses() {
    if fetch; then cat "$t/out"; fail "$kind fetch-release.sh accepted $1"; fi
    grep -qF "$2" "$t/out" || { cat "$t/out"; fail "$kind fetch-release.sh refused $1 for another reason"; }
    ok "$kind fetch-release.sh refuses $1"
  }
  setup "$(run_json push main success "$wf" DYAI2025/Ana)" "ana-$kind-$SHA" "$RUN"
  fetch || { cat "$t/out"; fail "$kind fetch-release.sh refused a push run on main"; }
  bash "$root/deploy/ana-$kind/release.sh" --check-bundle "$SHA" "$t/dl" > /dev/null || fail "$kind: fetched bundle fails release.sh"
  ok "$kind fetch-release.sh accepts the push run on main and its bundle passes release.sh"
  setup "$(run_json pull_request main success "$wf" DYAI2025/Ana)" "ana-$kind-$SHA" "$RUN"
  fetch_refuses "a pull_request run (canary: release-shaped artifact name)" "is not a successful push run"
  setup "$(run_json push feature success "$wf" DYAI2025/Ana)" "ana-$kind-$SHA" "$RUN"
  fetch_refuses "a push run on another branch" "is not a successful push run"
  setup "$(run_json push main failure "$wf" DYAI2025/Ana)" "ana-$kind-$SHA" "$RUN"
  fetch_refuses "a failed run" "is not a successful push run"
  setup "$(run_json push main success ci.yml DYAI2025/Ana)" "ana-$kind-$SHA" "$RUN"
  fetch_refuses "a run of another workflow" "is not a successful push run"
  setup "$(run_json push main success "$wf" someone/Ana)" "ana-$kind-$SHA" "$RUN"
  fetch_refuses "a run from a fork" "is not a successful push run"
  setup "$(run_json push main success "$wf" DYAI2025/Ana)" "ana-$kind-pr-$SHA" "$RUN"
  fetch_refuses "a run without the release artifact" "no single unexpired artifact"
  setup "$(run_json push main success "$wf" DYAI2025/Ana)" "ana-$kind-$SHA" 1
  fetch_refuses "a bundle built by another run" "run_id=$RUN"
  echo '{"workflow_runs":[]}' > "$FIX/runs.json"
  fetch_refuses "a commit without a push run" "no successful push run"
done
echo "release provenance: $n checks passed"
