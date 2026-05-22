#!/bin/bash
# CodyWatcher - Setup Script
# Creates directory structure, validates dependencies, prints hook configuration

CODWATCHER_DIR="$HOME/.codywatcher"
SESSIONS_DIR="/tmp/codywatcher/sessions"

echo "=== CodyWatcher Setup ==="
echo ""

# Step 1: Create directory structure
echo "[1/5] Creating directories..."
mkdir -p "$CODWATCHER_DIR"
mkdir -p "$SESSIONS_DIR"
echo "  Created ~/.codywatcher/"
echo "  Created /tmp/codywatcher/sessions/"

# Step 2: Check dependencies
echo "[2/5] Checking dependencies..."

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

echo ""

# Step 3: Make scripts executable
echo "[3/5] Setting permissions..."
chmod +x "$CODWATCHER_DIR/hook.sh" 2>/dev/null && echo "  hook.sh: executable" || echo "  hook.sh: not found"
chmod +x "$CODWATCHER_DIR/install.sh" && echo "  install.sh: executable"

echo ""

# Step 4: Print hook configuration
echo "[4/5] Hook Configuration"
echo ""
echo "Add the following to ~/.cody-claude/settings.json:"
echo ""
cat << 'CONFIG'
{
  "permissionHooks": {
    "PermissionRequestHook": {
      "matcher": ".*",
      "command": "~/.codywatcher/hook.sh '${sessionId}' '${toolName}' '${promptText}'"
    }
  },
  "hooks": {
    "SessionStartHook": [
      { "command": "mkdir -p /tmp/codywatcher/sessions" }
    ],
    "SessionEndHook": [
      { "command": "rm -f /tmp/codywatcher/sessions/${sessionId}.fifo" }
    ]
  }
}
CONFIG

echo ""

# Step 5: Start instructions
echo "[5/5] Starting the Daemon"
echo ""
echo "To start the daemon manually:"
echo "  bun run ~/.codywatcher/daemon.ts &"
echo ""
echo "For persistence across restarts, create a launchd plist at:"
echo "  ~/Library/LaunchAgents/com.codywatcher.daemon.plist"
echo ""
echo "=== Setup Complete ==="
