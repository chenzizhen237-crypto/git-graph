#!/usr/bin/env bash
# Copy the live Nib workspace file into assets/design.
# Nib does not follow symlinks, so the workspace copy is the one you edit.
set -euo pipefail

src="$HOME/Library/Application Support/Nib/workspace/git-graph/Git Graph Desktop.nib"
dest="$(cd "$(dirname "$0")" && pwd)/design/Git Graph Desktop.nib"

if [[ ! -f "$src" ]]; then
  echo "Nib file not found: $src" >&2
  exit 1
fi

if [[ -f "$dest" ]] && cmp -s "$src" "$dest"; then
  echo "Already up to date."
  exit 0
fi

mkdir -p "$(dirname "$dest")"
cp "$src" "$dest"
echo "Copied → ${dest#"$PWD/"}"
