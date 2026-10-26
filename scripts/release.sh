#!/bin/bash
# Local macOS release: checks, builds the Mac app and publishes it as the latest GitHub release.
# Meant for Jimmy's Mac mini:  jimmy-test --ref main -- pnpm release
#
# The version comes from package.json; tauri.conf.json, Cargo.toml and
# .github/release-notes/v<version>.md must agree. HEAD must already be on GitHub,
# because the release tag is created at that commit.
#
#   ARCHS="aarch64 x86_64"  also build Intel (needs: rustup target add x86_64-apple-darwin)
#   --dry-run               build and package, but don't publish
set -euo pipefail

DRY_RUN=0
case "${1:-}" in "") ;; --dry-run) DRY_RUN=1 ;; *) echo "Usage: $0 [--dry-run]"; exit 2 ;; esac
[[ "$(uname -s)" == Darwin ]] || { echo "Releases are built on macOS."; exit 1; }
cd "$(dirname "$0")/.."

VERSION="$(jq -r .version package.json)"
TAG="v$VERSION"
NOTES=".github/release-notes/$TAG.md"
ARCHS="${ARCHS:-aarch64}"
OUT="release/$TAG"

echo "[1/4] Checking $TAG..."
[[ "$(jq -r .version src-tauri/tauri.conf.json)" == "$VERSION" ]] || { echo "tauri.conf.json version is not $VERSION."; exit 1; }
grep -q "^version = \"$VERSION\"$" src-tauri/Cargo.toml || { echo "Cargo.toml version is not $VERSION."; exit 1; }
[[ -f "$NOTES" ]] || { echo "Missing release notes: $NOTES"; exit 1; }
SHA="$(git rev-parse HEAD)"
if [[ "$DRY_RUN" == 0 ]]; then
  [[ -z "$(git status --porcelain)" ]] || { echo "The working tree has uncommitted changes."; exit 1; }
  gh api "repos/{owner}/{repo}/commits/$SHA" --silent 2>/dev/null || { echo "HEAD ($SHA) is not on GitHub; push it first."; exit 1; }
  if gh release view "$TAG" >/dev/null 2>&1; then echo "Release $TAG already exists."; exit 1; fi
fi

echo "[2/4] Lint, typecheck and tests..."
pnpm install --frozen-lockfile --prefer-offline --reporter=silent
pnpm check

echo "[3/4] Building for $ARCHS..."
rm -rf "$OUT"
mkdir -p "$OUT"
for arch in $ARCHS; do
  # The Tauri CLI only accepts CI=true/false; jimmy-test and others set CI=1.
  CI="$([[ -n "${CI:-}" ]] && echo true || echo false)" pnpm tauri build --target "$arch-apple-darwin" --bundles app,dmg
  bundle="src-tauri/target/$arch-apple-darwin/release/bundle"
  # Asset names match what tauri-action published, which scripts/Update-Git-Graph.command looks for.
  [[ "$arch" == x86_64 ]] && name=x64 || name="$arch"
  COPYFILE_DISABLE=1 tar -czf "$OUT/Git.Graph_${VERSION}_${name}.app.tar.gz" -C "$bundle/macos" "Git Graph.app"
  cp "$bundle/dmg/Git Graph_${VERSION}_${name}.dmg" "$OUT/Git.Graph_${VERSION}_${name}.dmg"
done
ls -lh "$OUT"

if [[ "$DRY_RUN" == 1 ]]; then
  echo "Dry run: built $TAG in $OUT, nothing published."
  exit 0
fi

echo "[4/4] Publishing $TAG..."
gh release create "$TAG" "$OUT"/* --target "$SHA" --title "Git Graph $TAG" --notes-file "$NOTES" --latest
gh release view "$TAG" --json url -q .url
