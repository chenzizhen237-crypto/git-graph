#!/usr/bin/env bash
# Land a branch on main without GitHub CI: merge it onto the latest main, run `jimmy-test ci` on exactly
# that merge, and push main only if it passes. One branch lands at a time.
#
#   scripts/land.sh <branch>                       local or origin branch
#   scripts/land.sh <branch> --override "reason"   skip the tests when Jimmy is down; the reason is recorded
#
# LAND_TRAILER adds a trailer line to the merge commit.
# The result is kept as a git note in refs/notes/land and a line in .git/land.log, for example:
#   git log -1 --notes=land main
set -euo pipefail

die() { echo "land: $*" >&2; exit 1; }

BRANCH="" OVERRIDE=""
while [ $# -gt 0 ]; do
  case $1 in
    --override) [ $# -ge 2 ] && [ -n "$2" ] || die "--override needs a reason"; OVERRIDE=$2; shift ;;
    -*) die "unknown option $1" ;;
    *) [ -z "$BRANCH" ] || die "one branch at a time"; BRANCH=$1 ;;
  esac
  shift
done
[ -n "$BRANCH" ] || die 'usage: land.sh <branch> [--override "reason"]'
BRANCH=${BRANCH#origin/}

HERE=$(cd "$(dirname "$0")" && pwd)
COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd)
LOCK=$COMMON/land.lock LOG=$COMMON/land.log OUT=$COMMON/land-last.log
mkdir -p "$COMMON/hooks"
cp "$HERE/hooks/pre-push" "$COMMON/hooks/pre-push"

mkdir "$LOCK" 2>/dev/null || die "another landing holds $LOCK: $(cat "$LOCK/branch" 2>/dev/null). Remove it if that run is gone."
echo "$BRANCH" >"$LOCK/branch"
TMP=$(mktemp -d)
cleanup() {
  git worktree remove --force "$TMP/tree" 2>/dev/null || true
  rm -rf "$TMP" "$LOCK"
}
trap cleanup EXIT

git fetch -q origin
git fetch -q origin +refs/notes/land:refs/notes/land 2>/dev/null || true

# The newest of the local and origin branch; two different histories need a person.
localTip=$(git rev-parse -q --verify "refs/heads/$BRANCH" || true)
originTip=$(git rev-parse -q --verify "refs/remotes/origin/$BRANCH" || true)
TIP=${localTip:-$originTip}
[ -n "$TIP" ] || die "no branch $BRANCH here or on origin"
if [ -n "$localTip" ] && [ -n "$originTip" ] && [ "$localTip" != "$originTip" ]; then
  if git merge-base --is-ancestor "$localTip" "$originTip"; then TIP=$originTip
  elif ! git merge-base --is-ancestor "$originTip" "$localTip"; then die "$BRANCH differs here and on origin"
  fi
fi
if git merge-base --is-ancestor "$TIP" origin/main; then echo "land: $BRANCH is already on main"; exit 0; fi

git worktree add -q --detach "$TMP/tree" origin/main
if ! git -C "$TMP/tree" merge -q --no-ff -m "Land $BRANCH" ${LAND_TRAILER:+-m "$LAND_TRAILER"} "$TIP"; then
  git -C "$TMP/tree" diff --name-only --diff-filter=U >&2
  die "$BRANCH conflicts with main; nothing landed"
fi
MERGE=$(git -C "$TMP/tree" rev-parse HEAD)

if [ -n "$OVERRIDE" ]; then
  RESULT="OVERRIDE, tests skipped: $OVERRIDE"
else
  echo "land: testing $BRANCH on main (${MERGE:0:7})"
  if ! (cd "$TMP/tree" && jimmy-test --clean ci) 2>&1 | tee "$OUT"; then
    echo "$(date +%FT%T) FAIL $BRANCH ${TIP:0:7}" >>"$LOG"
    die "ci failed; main is unchanged. Full output: $OUT"
  fi
  RESULT=$(grep -E '^(PASS|FAIL) ' "$OUT" | tail -1)
fi

GIT_GRAPH_LANDING=1 git -C "$TMP/tree" push -q origin HEAD:refs/heads/main || die "main moved during the run; land again"
git notes --ref=land add -f -m "$BRANCH ${TIP:0:7}: $RESULT" "$MERGE"
GIT_GRAPH_LANDING=1 git push -q origin refs/notes/land || echo "land: main is pushed, but the note isn't" >&2
echo "$(date +%FT%T) LAND $BRANCH ${TIP:0:7} -> ${MERGE:0:7}: $RESULT" >>"$LOG"

# Bring the checkout of main along when it's clean.
mainTree=$(git worktree list --porcelain | awk '/^worktree /{t=$2} /^branch refs\/heads\/main$/{print t}')
if [ -n "$mainTree" ] && [ -z "$(git -C "$mainTree" status --porcelain)" ]; then
  git -C "$mainTree" merge -q --ff-only "$MERGE" || true
fi
echo "land: $BRANCH is on main as ${MERGE:0:7}"
