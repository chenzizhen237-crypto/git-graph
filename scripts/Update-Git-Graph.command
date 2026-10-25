#!/bin/bash
# Standalone macOS installer. No Git, Node.js, or GitHub account required.
# --prepare downloads and validates the app without changing the installation.
set -euo pipefail

MODE="${1:-install}"
case "$MODE" in install|--prepare) ;; *) echo "Usage: $0 [--prepare]"; exit 2 ;; esac
[[ "$(uname -s)" == Darwin ]] || { echo "This installer requires macOS."; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/git-graph-installer.XXXXXX")"
TARGET="/Applications/Git Graph.app"
BACKUP=""
STAGE=""
MOVED_OLD=0
SUCCESS=0
NEEDS_SUDO=0
install_cmd() {
  if [[ "$NEEDS_SUDO" == 1 ]]; then
    /usr/bin/sudo "$@"
  else
    "$@"
  fi
}

cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$SUCCESS" == 0 && "$MOVED_OLD" == 1 && ! -e "$TARGET" ]]; then
    echo "Restoring the previous Git Graph installation..."
    install_cmd /bin/mv "$BACKUP" "$TARGET" || echo "Restore manually from: $BACKUP"
  fi
  [[ -z "$STAGE" ]] || install_cmd /bin/rm -rf "$STAGE"
  /bin/rm -rf "$WORK"
  if [[ "$result" != 0 ]]; then
    echo "Installation failed. Your documents have not been changed."
  fi
  if [[ "$MODE" == install && -t 0 ]]; then
    read -r -p "Press Return to close... " _ || true
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fetch() {
  /usr/bin/curl --fail --location --retry 3 --connect-timeout 20 \
    --max-time 1800 --proto '=https' --proto-redir '=https' "$@"
}

echo "[1/4] Finding the latest Git Graph release..."
REPO="chenzizhen237-crypto/git-graph"
fetch --silent --show-error --header 'Accept: application/vnd.github+json' \
  --output "$WORK/release.json" "https://api.github.com/repos/$REPO/releases/latest"
json_value() {
  /usr/bin/plutil -extract "$1" raw -o - "$WORK/release.json"
}
TAG="$(json_value tag_name)"
VERSION="${TAG#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || {
  echo "Invalid release version."; exit 1;
}
if [[ "$(uname -m)" == arm64 || "$(/usr/sbin/sysctl -in sysctl.proc_translated 2>/dev/null || true)" == 1 ]]; then
  ARCH=aarch64
  MACH_ARCH=arm64
else
  ARCH=x64
  MACH_ARCH=x86_64
fi
ASSET_NAME="Git.Graph_${VERSION}_${ARCH}.app.tar.gz"
DOWNLOAD_URL=""
EXPECTED=""
for ((i=0; ; i++)); do
  NAME="$(json_value "assets.$i.name" 2>/dev/null)" || break
  if [[ "$NAME" == "$ASSET_NAME" ]]; then
    DOWNLOAD_URL="$(json_value "assets.$i.browser_download_url")"
    EXPECTED="$(json_value "assets.$i.digest")"
    break
  fi
done
[[ "$DOWNLOAD_URL" == "https://github.com/$REPO/releases/download/$TAG/$ASSET_NAME" ]] || {
  echo "The latest release has no supported Mac archive for $ARCH."; exit 1;
}
[[ "$EXPECTED" =~ ^sha256:[a-f0-9]{64}$ ]] || {
  echo "Missing or invalid SHA-256 digest in release metadata."; exit 1;
}

echo "[2/4] Downloading Git Graph $VERSION ($ARCH)..."
fetch --progress-bar --output "$WORK/app.tar.gz" "$DOWNLOAD_URL"
ACTUAL="$(/usr/bin/shasum -a 256 "$WORK/app.tar.gz" | /usr/bin/awk '{print $1}')"
[[ "sha256:$ACTUAL" == "$EXPECTED" ]] || { echo "Checksum mismatch; refusing to install."; exit 1; }

echo "[3/4] Extracting and validating..."
/bin/mkdir "$WORK/extracted"
/usr/bin/tar -tzf "$WORK/app.tar.gz" > "$WORK/entries"
if /usr/bin/grep -Eq '(^/|(^|/)\.\.(/|$))' "$WORK/entries"; then
  echo "Unsafe archive paths; refusing to extract."; exit 1
fi
/usr/bin/tar -xzf "$WORK/app.tar.gz" -C "$WORK/extracted"
APP="$WORK/extracted/Git Graph.app"
PLIST="$APP/Contents/Info.plist"
[[ -f "$PLIST" ]] || { echo "The archive does not contain Git Graph.app."; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")" == dev.lucas.gitgraph ]] || {
  echo "Unexpected application identifier."; exit 1;
}
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")" == "$VERSION" ]] || {
  echo "Application version does not match the release."; exit 1;
}
EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")"
[[ "$EXECUTABLE" != */* && -x "$APP/Contents/MacOS/$EXECUTABLE" ]] || {
  echo "The application executable is missing."; exit 1;
}
/usr/bin/lipo -verify_arch "$MACH_ARCH" "$APP/Contents/MacOS/$EXECUTABLE"
/usr/bin/codesign --verify --deep --strict "$APP"
if [[ "$MODE" == --prepare ]]; then
  echo "Verified Git Graph $VERSION: download, SHA-256, extraction, app metadata, architecture, and code signature passed."
  SUCCESS=1
  exit 0
fi

echo "[4/4] Installing into /Applications..."
if [[ ! -w /Applications ]]; then
  echo "macOS needs your administrator password to install in /Applications."
  NEEDS_SUDO=1
  /usr/bin/sudo -v
fi
# Copy completely before asking the running app to quit or moving the old version.
STAGE="$(install_cmd /usr/bin/mktemp -d /Applications/.git-graph-install.XXXXXX)"
install_cmd /usr/bin/ditto "$APP" "$STAGE/Git Graph.app"
# Releases are ad-hoc signed; remove only the download quarantine attribute.
install_cmd /usr/bin/xattr -r -d com.apple.quarantine "$STAGE/Git Graph.app" 2>/dev/null || true
/usr/bin/codesign --verify --deep --strict "$STAGE/Git Graph.app"
if /usr/bin/pgrep -x "$EXECUTABLE" >/dev/null; then
  echo "Quitting Git Graph. Save any work if Git Graph prompts you."
  /usr/bin/osascript -e 'tell application id "dev.lucas.gitgraph" to quit'
  for ((i=0; i<60; i++)); do
    /usr/bin/pgrep -x "$EXECUTABLE" >/dev/null || break
    /bin/sleep 1
  done
  if /usr/bin/pgrep -x "$EXECUTABLE" >/dev/null; then
    echo "Git Graph is still running. Quit it and run this installer again."; exit 1
  fi
fi
if [[ -e "$TARGET" ]]; then
  BACKUP_ROOT="$HOME/Library/Application Support/Git Graph/Installer Backups"
  /bin/mkdir -p "$BACKUP_ROOT"
  BACKUP_DIR="$(/usr/bin/mktemp -d "$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S).XXXXXX")"
  BACKUP="$BACKUP_DIR/Git Graph.app"
  install_cmd /bin/mv "$TARGET" "$BACKUP"
  MOVED_OLD=1
fi
install_cmd /bin/mv "$STAGE/Git Graph.app" "$TARGET"
SUCCESS=1
echo "Installed Git Graph $VERSION."
[[ -z "$BACKUP" ]] || echo "Previous version: $BACKUP"
/usr/bin/open "$TARGET" || echo "Installed successfully. Open Git Graph from Applications."
