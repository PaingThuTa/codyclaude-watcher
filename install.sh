#!/bin/bash
# CodyWatcher Installation Script
# One-command setup: creates directory structure, builds binaries, configures hooks, installs LaunchAgent

set -e

CODWATCHER_DIR="$HOME/.codywatcher"
SESSIONS_DIR="/tmp/codywatcher/sessions"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/com.codysecret1.codywatcher.plist"

echo "=== CodyWatcher Installation ==="
echo ""

# Step 1: Create directory structure (INST-01)
echo "[1/6] Creating directories..."
mkdir -p "$CODWATCHER_DIR/bin"
mkdir -p "$CODWATCHER_DIR/config"
mkdir -p "$CODWATCHER_DIR/state"
mkdir -p "$CODWATCHER_DIR/log"
mkdir -p "$SESSIONS_DIR"
echo "  Created ~/.codywatcher/ with bin/, config/, state/, log/"
echo "  Created $SESSIONS_DIR/"

# Step 2: Check dependencies
echo "[2/6] Checking dependencies..."

if ! command -v bun &> /dev/null; then
  echo "  ERROR: bun is required but not installed"
  echo "  Install bun: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "  bun: $(bun --version)"

if ! command -v jq &> /dev/null; then
  echo "  ERROR: jq is required but not installed"
  echo "  Install jq: brew install jq"
  exit 1
fi
echo "  jq: $(jq --version)"

if ! command -v swiftc &> /dev/null; then
  echo "  ERROR: swiftc is required but not installed"
  echo "  Install Xcode from Mac App Store or: xcode-select --install"
  exit 1
fi
echo "  swiftc: available"

echo ""

# Step 3: Copy source files to ~/.codywatcher/bin/
echo "[3/6] Copying source files..."
cp "$SCRIPT_DIR/daemon.ts" "$CODWATCHER_DIR/bin/"
cp "$SCRIPT_DIR/hook.sh" "$CODWATCHER_DIR/bin/"
echo "  Copied daemon.ts and hook.sh to ~/.codywatcher/bin/"

# Step 4: Copy and compile listen-yesno.swift (INST-02)
echo "[4/6] Compiling listen-yesno.swift..."
SWIFT_SRC="$SCRIPT_DIR/.codywatcher/listen-yesno.swift"
if [ -f "$SWIFT_SRC" ]; then
  cp "$SWIFT_SRC" "$CODWATCHER_DIR/bin/listen-yesno.swift"
  cd "$CODWATCHER_DIR/bin"
  swiftc listen-yesno.swift -o listen-yesno -framework Speech -framework AVFoundation
  chmod +x listen-yesno
  echo "  Compiled listen-yesno.swift to binary"
else
  echo "  WARNING: listen-yesno.swift not found at $SWIFT_SRC"
fi

# Step 5: Make scripts executable
echo "[5/6] Setting permissions..."
chmod +x "$CODWATCHER_DIR/bin/hook.sh"
chmod +x "$CODWATCHER_DIR/bin/daemon.ts"
echo "  hook.sh and daemon.ts are executable"

# Step 6: Merge hooks into settings.json (INST-03)
echo "[6/6] Configuring hooks..."
SETTINGS_FILE="$HOME/.cody-claude/settings.json"

# Create hook configuration JSON
HOOKS_JSON=$(cat <<HOOKS_EOF
{
  "permissionHooks": {
    "PermissionRequestHook": {
      "matcher": ".*",
      "command": "$CODWATCHER_DIR/bin/hook.sh '\${sessionId}' '\${toolName}' '\${promptText}'"
    }
  },
  "hooks": {
    "SessionStartHook": [
      { "command": "mkdir -p $SESSIONS_DIR" }
    ],
    "SessionEndHook": [
      { "command": "rm -f $SESSIONS_DIR/'\${sessionId}'.fifo" }
    ]
  }
}
HOOKS_EOF
)

if [ -f "$SETTINGS_FILE" ]; then
  # Merge with existing settings
  TEMP_FILE=$(mktemp)
  if ! jq -s '.[0] * .[1]' "$SETTINGS_FILE" <(echo "$HOOKS_JSON") > "$TEMP_FILE"; then
    echo "  ERROR: Failed to merge hooks with jq"
    cat "$TEMP_FILE" 2>/dev/null || true
    rm -f "$TEMP_FILE"
    exit 1
  fi
  mv "$TEMP_FILE" "$SETTINGS_FILE"
  echo "  Merged hooks into $SETTINGS_FILE"
else
  # Create new settings file
  echo "$HOOKS_JSON" > "$SETTINGS_FILE"
  echo "  Created $SETTINGS_FILE"
fi

# Verify hook merge worked
if ! grep -q "permissionHooks" "$SETTINGS_FILE"; then
  echo "  ERROR: Hook merge verification failed - permissionHooks not in settings.json"
  exit 1
fi

# Step 7: Create and install LaunchAgent (INST-04, INST-05)
echo ""
echo "=== Installing LaunchAgent ==="
mkdir -p "$HOME/Library/LaunchAgents"

# Create launchd plist with user-specific paths
cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.codysecret1.codywatcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>${BUN_PATH:-/usr/local/bin/bun}</string>
        <string>run</string>
        <string>${HOME}/.codywatcher/bin/daemon.ts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${HOME}/.codywatcher/log/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/.codywatcher/log/daemon.log</string>
</dict>
</plist>
PLIST

echo "  Created $PLIST_PATH"

# Load the LaunchAgent
echo "  Loading LaunchAgent..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true
if ! launchctl load "$PLIST_PATH" 2>&1; then
  echo "  ERROR: Failed to load LaunchAgent"
  echo "  Check plist with: launchctl error com.codysecret1.codywatcher"
  exit 1
fi
echo "  LaunchAgent loaded"

echo ""
echo "=== Installation Complete ==="
echo ""
echo "The CodyWatcher daemon is now running."
echo ""
echo "Verifying installation..."
sleep 1

# Verify LaunchAgent actually loaded
if launchctl list | grep -q "com.codysecret1.codywatcher"; then
  echo "  LaunchAgent installed and running"
else
  echo "  ERROR: LaunchAgent not listed in launchctl after load"
  echo "  Run 'launchctl error com.codysecret1.codywatcher' to diagnose"
  exit 1
fi

# Verify daemon is running
DAEMON_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:18765/status 2>/dev/null || echo "000")
if [ "$DAEMON_STATUS" = "200" ]; then
  echo "  Daemon responding on localhost:18765"
else
  echo "  WARNING: Daemon not responding (status: $DAEMON_STATUS)"
  echo "  The daemon will start automatically on next login."
  echo "  To start manually: bun run ~/.codywatcher/bin/daemon.ts"
fi

# Verify LaunchAgent
if launchctl list | grep -q "com.codysecret1.codywatcher"; then
  echo "  LaunchAgent installed and running"
else
  echo "  WARNING: LaunchAgent not listed in launchctl"
fi

echo ""
echo "Next steps:"
echo "  1. Start a new Claude Code session"
echo "  2. When a permission request appears, say 'yes' or 'no'"
echo "  3. The daemon will use macOS Speech Recognition to process your voice"