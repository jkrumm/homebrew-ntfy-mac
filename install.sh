#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/.local/bin"
BINARY="$INSTALL_DIR/ntfy-mac"
STATE_DIR="$HOME/.local/share/ntfy-mac"
LABEL="com.jkrumm.ntfy-mac"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# ── Architecture ──────────────────────────────────────────────────────────────

ARCH=$(uname -m)
if [[ "$ARCH" != "arm64" ]]; then
  echo "ntfy-mac requires Apple Silicon (arm64). Got: $ARCH" >&2
  exit 1
fi

# ── Latest version ────────────────────────────────────────────────────────────

echo "Fetching latest version..."
LATEST=$(curl -fsSL "https://api.github.com/repos/jkrumm/ntfy-mac/releases/latest" \
  | grep '"tag_name"' \
  | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
if [[ -z "$LATEST" ]]; then
  echo "Failed to fetch latest version" >&2
  exit 1
fi

# ── Download binary ───────────────────────────────────────────────────────────

echo "Installing ntfy-mac $LATEST (arm64)..."
mkdir -p "$INSTALL_DIR" "$STATE_DIR" "$(dirname "$PLIST")"

# ── Main binary ────────────────────────────────────────────────────────────────
curl -fsSL \
  "https://github.com/jkrumm/ntfy-mac/releases/download/$LATEST/ntfy-mac" \
  -o "$BINARY.tmp"
chmod +x "$BINARY.tmp"
mv "$BINARY.tmp" "$BINARY"

# ── Swift notification helper (.app bundle) ────────────────────────────────────
curl -fsSL \
  "https://github.com/jkrumm/ntfy-mac/releases/download/$LATEST/ntfy-notify.app.tar.gz" \
  -o "$STATE_DIR/ntfy-notify.app.tar.gz"
tar -xzf "$STATE_DIR/ntfy-notify.app.tar.gz" -C "$STATE_DIR"
rm -f "$STATE_DIR/ntfy-notify.app.tar.gz"

# ── LaunchAgent ───────────────────────────────────────────────────────────────

IS_UPDATE=false
if [[ -f "$PLIST" ]]; then
  IS_UPDATE=true
fi

if [[ "$IS_UPDATE" == false ]]; then
  # First install: write plist and register service
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BINARY</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$STATE_DIR/ntfy-mac.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE_DIR/ntfy-mac-error.log</string>
</dict>
</plist>
EOF
  launchctl load -w "$PLIST"
else
  # Update: restart the running daemon with the new binary
  launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null \
    || launchctl load -w "$PLIST"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
if [[ "$IS_UPDATE" == true ]]; then
  echo "ntfy-mac updated to $LATEST."
else
  echo "ntfy-mac $LATEST installed."
  echo ""
  echo "Next: run ntfy-mac setup"
fi

# Warn if the shell would resolve a different ntfy-mac than the one just installed
resolved_bin="$(command -v ntfy-mac 2>/dev/null || true)"
if [[ "$resolved_bin" != "$BINARY" ]]; then
  echo ""
  if [[ -n "$resolved_bin" ]]; then
    echo "Note: your shell currently resolves ntfy-mac to: $resolved_bin"
  fi
  echo "Add $INSTALL_DIR to the front of your PATH:"
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
  echo "Or run setup explicitly: $BINARY setup"
fi
