#!/bin/bash
# PermissionRequestHook integration for CodyWatcher
# Usage: hook.sh <sessionId> <toolName> <promptText>
# Outputs: Decision JSON to stdout for Claude Code's PermissionRequestHook to parse
# Falls through silently (no stdout) when daemon is not running

DAEMON_URL="http://localhost:18765/notify"
SESSIONS_DIR="/tmp/codywatcher/sessions"
FIFO_TIMEOUT=30

SESSION_ID="$1"
TOOL="$2"
PROMPT="$3"

if [ -z "$SESSION_ID" ] || [ -z "$TOOL" ] || [ -z "$PROMPT" ]; then
  echo "Usage: hook.sh <sessionId> <toolName> <promptText>" >&2
  exit 0
fi

# Ensure sessions directory exists
mkdir -p "$SESSIONS_DIR"

# Step 1: Pre-create FIFO (D-07, HOOK-02)
FIFO="${SESSIONS_DIR}/${SESSION_ID}.fifo"
[ -p "$FIFO" ] || mkfifo "$FIFO"

# Step 2: POST to daemon with jq-safe JSON encoding (D-08, HOOK-03)
BODY=$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg tool "$TOOL" \
  --arg prompt "$PROMPT" \
  '{"sessionId":$sid,"tool":$tool,"prompt":$prompt}')

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 2 \
  --max-time 5 \
  -X POST "$DAEMON_URL" \
  -H "Content-Type: application/json" \
  -H "X-CodyWatcher-Key: ${CODYWATCHER_KEY}" \
  -d "$BODY" 2>/dev/null) || {
  # Daemon not reachable — exit silently, Claude falls through to normal prompt (D-05)
  exit 0
}

if [ "$HTTP_CODE" -ne 200 ] 2>/dev/null; then
  # Non-200 response — exit silently, Claude falls through
  exit 0
fi

# Step 3: Read decision from FIFO with timeout (D-09, HOOK-04)
DECISION=$(timeout "$FIFO_TIMEOUT" cat "$FIFO" 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$DECISION" ]; then
  DECISION='{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Daemon timed out"}}}'
fi

# Step 4: Output decision to stdout only (D-12, HOOK-05)
echo "$DECISION"
