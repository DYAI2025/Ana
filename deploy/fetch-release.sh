#!/usr/bin/env bash
# Downloads the release bundle of one main commit on the operator's machine, for deploy/ana-dashboard/release.sh or
# deploy/ana-brain/release.sh (README section 1, invariant 1 of each kit):
#   deploy/fetch-release.sh dashboard <full git sha> <dest dir>
#   deploy/fetch-release.sh brain     <full git sha> <dest dir>
#
# A bundle is released only from a successful push run of its workflow on main for exactly that commit. A matching
# file name is not enough: pull_request runs used to upload ana-dashboard-<sha> / ana-brain-<sha> too (before 329f4a9),
# often named after GitHub's test merge commit. So this script
#   1. finds the run through the API filters (workflow, event push, branch main, head_sha, status success),
#   2. re-reads that run and requires event push, head_branch main, head_sha = <sha>, conclusion success, the
#      workflow file, and repository = head repository = DYAI2025/Ana (no fork),
#   3. downloads exactly one unexpired artifact ana-<kind>-<sha> of that run,
#   4. requires the bundle's .ana-build to name that run, event push, ref main and <sha>; release.sh checks the same
#      file and the checksum again on the host.
# Needs gh (logged in, read access to DYAI2025/Ana), tar and a POSIX userland; GH=<path> replaces gh (CI uses a stub).
# Changes nothing on GitHub or on any host.
set -euo pipefail

repo=DYAI2025/Ana
gh="${GH:-gh}"
fail() { echo "fetch-release: $*" >&2; exit 1; }

kind="${1:-}" sha="${2:-}" dest="${3:-}"
case "$kind" in
  dashboard) wf=dashboard-image.yml ;;
  brain) wf=brain.yml ;;
  *) fail "usage: fetch-release.sh <dashboard|brain> <full git sha> <dest dir>" ;;
esac
[[ "$sha" =~ ^[0-9a-f]{40}$ && -n "$dest" ]] || fail "usage: fetch-release.sh <dashboard|brain> <full git sha> <dest dir>"
name="ana-$kind-$sha"

runs="$("$gh" api -X GET "repos/$repo/actions/workflows/$wf/runs" -f head_sha="$sha" -f event=push -f branch=main \
  -f status=success --jq '.workflow_runs[].id')" || fail "could not list the runs of $wf"
run="$(printf '%s\n' "$runs" | sed -n '1p')"
[[ "$run" =~ ^[0-9]+$ ]] || fail "no successful push run of $wf on main for $sha"

meta="$("$gh" api "repos/$repo/actions/runs/$run" --jq \
  '[.event, .head_branch, .head_sha, .status, .conclusion, (.path | split("@")[0]), .repository.full_name, .head_repository.full_name] | join(" ")')" ||
  fail "could not read run $run"
want="push main $sha completed success .github/workflows/$wf $repo $repo"
[[ "$meta" == "$want" ]] || fail "run $run is not a successful push run of $wf on main for $sha: '$meta', expected '$want'"

arts="$("$gh" api "repos/$repo/actions/runs/$run/artifacts" --jq \
  ".artifacts[] | select(.name == \"$name\" and .expired == false) | .id")" || fail "could not list the artifacts of run $run"
[[ "$(printf '%s\n' "$arts" | grep -c '^[0-9][0-9]*$')" == 1 ]] || fail "run $run has no single unexpired artifact $name"

mkdir -p "$dest"
"$gh" run download "$run" -R "$repo" -n "$name" -D "$dest" || fail "download of $name from run $run failed"
tarball="$dest/ana-$kind-app-$sha.tar.gz"
[[ -f "$tarball" && -f "$tarball.sha256" ]] || fail "$name has no ana-$kind-app-$sha.tar.gz with its .sha256"
info="$(tar -xzOf "$tarball" ./.ana-build 2>/dev/null)" || fail "$tarball has no .ana-build"
for kv in "repository=$repo" "workflow=.github/workflows/$wf" event=push ref=refs/heads/main "sha=$sha" "run_id=$run"; do
  printf '%s\n' "$info" | grep -qxF "$kv" || fail "the bundle's .ana-build does not say $kv"
done
echo "fetch-release: $name from push run $run of $wf on main -> $dest (release.sh re-checks checksum and provenance)"
