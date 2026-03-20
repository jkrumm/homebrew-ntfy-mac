#!/usr/bin/env bash
# Compiles the ntfy-notify Swift helper into a signed .app bundle.
# Output: assets/ntfy-notify.app (ready for packaging or local dev use)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/assets/ntfy-notify.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"

mkdir -p "$MACOS_DIR"
mkdir -p "$APP_DIR/Contents/Resources"
cp "$ROOT/assets/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$ROOT/assets/ntfy-notify.app/Contents/Resources/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns" 2>/dev/null || true

echo "Compiling ntfy-notify Swift helper (arm64)..."
swiftc \
  -target arm64-apple-macos12.0 \
  -framework Foundation \
  -framework AppKit \
  -framework UserNotifications \
  -O \
  "$ROOT/assets/ntfy-notify.swift" \
  -o "$MACOS_DIR/ntfy-notify"

echo "Signing with ad-hoc signature..."
codesign --force --deep --sign - "$APP_DIR"

SIZE=$(du -sh "$MACOS_DIR/ntfy-notify" | cut -f1)
echo "✓ ntfy-notify.app built ($SIZE)"

# In dev: sync to ~/Applications so Launch Services registers the icon correctly.
# Notification permission (com.jkrumm.ntfy-notify) is preserved across rebuilds
# as long as the bundle ID and path don't change.
DEV_APP="$HOME/Applications/ntfy-notify.app"
if [[ -d "$DEV_APP" ]]; then
  rm -rf "$DEV_APP"
  cp -R "$APP_DIR" "$DEV_APP"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f "$DEV_APP" 2>/dev/null
  echo "✓ synced to ~/Applications/ntfy-notify.app"
fi
