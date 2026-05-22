# CodyWatcher — Terminal Watcher for Claude Code Sessions

**Date:** 2026-05-22
**Status:** Draft

## Problem

Running 3-4 concurrent Claude Code sessions in Ghostty requires manually checking each tab for permission prompts ("Do you want to proceed?", plan approvals, tool confirmations). Context switching between tabs breaks flow.

## Solution

A local daemon that receives permission request events from Claude hooks, announces them via macOS TTS, captures voice input for approval, and feeds the decision back to the blocked session.

## Architecture

```
┌─────────────────────┐     HTTP POST      ┌──────────────────┐
│  CodyClaude Tab 1   │ ───────────────────► │                  │
│  (PermissionRequest)│                     │                  │
├─────────────────────┤     HTTP POST      │  Watcher Daemon  │
│  CodyClaude Tab 2   │ ───────────────────► │  (localhost:18765)│
│  (PermissionRequest)│                     │                  │
├─────────────────────┤     HTTP POST      │  - session map   │
│  CodyClaude Tab 3   │ ───────────────────► │  - voice alerts  │
│  (PermissionRequest)│                     │  - auto-approve  │
└─────────────────────┘                     └────────┬─────────┘
                                                     │
                                          macOS `say` TTS → user says "yes"
                                          → daemon writes decision to FIFO
                                          → hook unblocks → Claude approves
```

## Components

### 1. Watcher Daemon (`daemon.ts`)

A Bun HTTP server listening on `localhost:18765`.

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/notify` | Receive permission request from session hook |
| POST | `/shutdown` | Clean shutdown (optional) |
| GET | `/status` | List active pending requests (debug) |

**State:**
- `Map<string, PendingRequest>` — tracks in-flight permission requests by session ID
- Each `PendingRequest`: `{ sessionId, tool, command, prompt, status: "pending" | "approved" | "denied" }`

**FIFO lifecycle:**
1. On first `/notify` for a session ID, daemon creates `/tmp/codywatcher/sessions/{sessionId}.fifo` via `mkfifo`
2. After voice input captured, daemon opens FIFO for writing and writes the approval JSON
3. FIFO is cleaned up on `SessionEndHook` or when session disconnects

### 2. Claude Hooks (configured in `~/.cody/settings.json`)

**PermissionRequestHook** — fires when Claude needs user approval:

```json
{
  "matcher": ".*",
  "command": "~/.codywatcher/hook.sh '${sessionId}' '${toolName}' '${promptText}'"
}
```

**SessionStartHook** — creates session directory:

```json
{
  "matcher": ".*",
  "command": "mkdir -p /tmp/codywatcher/sessions"
}
```

**SessionEndHook** — cleanup:

```json
{
  "matcher": ".*",
  "command": "rm -f /tmp/codywatcher/sessions/${sessionId}.fifo"
}
```

### 3. Hook Script (`hook.sh`)

Shell script that:
1. POSTs permission details to `http://localhost:18765/notify`
2. Reads decision from session FIFO (blocks)
3. Outputs the decision JSON to stdout for Claude to parse

```bash
#!/bin/bash
SESSION_ID="$1"
TOOL="$2"
PROMPT="$3"

curl -s -X POST http://localhost:18765/notify \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"tool\":\"$TOOL\",\"prompt\":\"$PROMPT\"}"

DECISION=$(cat /tmp/codywatcher/sessions/$SESSION_ID.fifo)
echo "$DECISION"
```

### 4. Voice Input (`listen-yesno`)

macOS Swift binary using the `Speech` framework.

**Behavior:**
- Listens for "yes" or "no" phrases
- 10-second timeout (configurable via `--timeout` flag)
- Exit codes: `0` = yes, `1` = no, `2` = timeout/unclear
- Works offline — uses on-device speech recognition

**Usage:**
```bash
./listen-yesno --timeout 10
# Returns 0 (yes), 1 (no), or 2 (timeout)
```

## Data Flow (Single Permission Request)

```
1. Claude session blocks on permission prompt
2. PermissionRequestHook fires → executes hook.sh
3. hook.sh POSTs to daemon:
   {
     "sessionId": "abc-123",
     "tool": "Bash",
     "prompt": "Do you want to proceed?"
   }
4. Daemon stores request in session map
5. Daemon runs: say "Session abc-123 asking to run Bash"
6. Daemon runs: ./listen-yesno --timeout 10
7. User says "yes" → Swift binary exits 0
8. Daemon writes to FIFO:
   {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}
9. hook.sh cat unblocks, reads JSON, echoes to stdout
10. Claude parses JSON → permission approved → session continues
```

## Denial Flow

Same as above, but step 7: user says "no" → Swift binary exits 1 → daemon writes:

```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied by voice"}}}
```

## Timeout Flow

Step 6: 10s passes, no voice input → Swift binary exits 2 → daemon writes deny to FIFO with message "Voice input timed out".

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Daemon not running | Hook falls through, Claude shows normal permission prompt (no breakage) |
| Voice recognition unclear | Daemon asks for confirmation or defaults to deny |
| FIFO write fails | Hook times out after 30s, Claude shows error |
| Multiple sessions notify simultaneously | Daemon queues them, processes sequentially |
| Session ends while request pending | Daemon cleans up FIFO, logs warning |

## Security

- Daemon binds to `localhost` only — not accessible from network
- FIFOs in `/tmp` with per-session unique names (Claude session IDs are UUIDs)
- No secrets, API keys, or network calls beyond localhost HTTP
- Hook JSON output sanitized — only `allow`/`deny` decisions

## File Structure

```
~/.codywatcher/
├── daemon.ts           # Bun HTTP server + session manager
├── listen-yesno        # Compiled Swift binary (voice recognition)
├── listen-yesno.swift  # Source for listen-yesno
├── hook.sh             # Shell script called by Claude hooks
└── install.sh          # Setup script: builds Swift binary, adds hooks to settings
```

## Install Script (`install.sh`)

One-liner for users:

```bash
curl -fsSL https://... | bash
```

Steps:
1. Creates `~/.codywatcher/` directory
2. Compiles `listen-yesno.swift` → `listen-yesno` binary
3. Installs daemon: `bun install --global ~/.codywatcher/daemon.ts` (or creates launchd plist)
4. Adds hook configuration to `~/.cody-claude/settings.json`
5. Starts daemon: `~/.codywatcher/daemon.ts &`

## macOS Launch (daemon persistence)

Use a `launchd` plist so the daemon starts on login:

```xml
<!-- ~/Library/LaunchAgents/com.codywatcher.daemon.plist -->
<plist>
<dict>
  <key>Label</key><string>com.codywatcher.daemon</string>
  <key>ProgramArguments</key>
  <array><string>/Users/.../.codywatcher/daemon.ts</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

## Engineering Review Decisions (2026-05-23)

### Resolved design decisions

**FIFO pre-creation:** Hook.sh creates the FIFO before POSTing to the daemon, not lazily on `/notify`. This eliminates a race condition where the hook's `cat` starts before the daemon's `mkfifo` completes.

```bash
# In hook.sh, before curl:
mkdir -p /tmp/codywatcher/sessions
FIFO="/tmp/codywatcher/sessions/$SESSION_ID.fifo"
[ -p "$FIFO" ] || mkfifo "$FIFO"
```

**Hook output:** Hook.sh silences curl output (`>/dev/null`) and echoes only the FIFO decision to stdout. Claude Code's PermissionRequestHook expects exactly one JSON object on stdout — the curl response must not leak.

### Open questions — resolved

**Voice prompt content:** `toolName` only, truncated for TTS clarity. `"Session abc-123 requesting to run Bash"` — the user can see the full prompt in their tab. The full prompt text is noise for TTS.

**Multiple simultaneous requests:** Queue and process sequentially. Two tabs asking at the same time: daemon TTSes them in order. Parallel voice would be chaotic — the user couldn't distinguish which request is being answered.

**"Approve all similar":** Defer to Phase 2. Adds state tracking and complex voice grammar, not needed for MVP.

## Code Quality Fixes (MUST fix before shipping)

### 1. Input sanitization in hook.sh

The current spec's string interpolation breaks if `$PROMPT` contains unescaped quotes or special characters:

```bash
# BROKEN — will produce invalid JSON if prompt contains quotes
curl -d "{\"sessionId\":\"$SESSION_ID\",\"tool\":\"$TOOL\",\"prompt\":\"$PROMPT\"}"
```

Fix: Use `jq` to build the JSON safely:

```bash
curl -s -X POST http://localhost:18765/notify \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg sid "$SESSION_ID" --arg tool "$TOOL" --arg prompt "$PROMPT" \
    '{"sessionId":$sid,"tool":$tool,"prompt":$prompt}')"
```

### 2. Timeout on FIFO read

Without a timeout, `cat` blocks forever if the daemon crashes after receiving the POST but before writing the decision. The Claude session is permanently stuck.

```bash
DECISION=$(timeout 30 cat /tmp/codywatcher/sessions/$SESSION_ID.fifo 2>/dev/null) || \
  DECISION='{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Daemon timed out"}}}'
```

### 3. Daemon error handling for missing FIFO

If the FIFO was deleted (session cleanup ran) but the daemon still tries to write to it, the write fails with `ENOENT`. The daemon should catch this and log a warning rather than crashing.

### 4. Optional: Shared secret for /notify

Any HTTP client on localhost can POST to `/notify` and trigger TTS. Low risk for localhost-only, but a simple `X-CodyWatcher-Key` header in the hook and daemon would prevent accidental mischief.

## Test Plan

```
CODE PATHS                                            USER FLOWS
[+] daemon.ts (Bun HTTP server)                       [+] Permission request flow
  ├── POST /notify                                      ├── [REQ] [→E2E] User says "yes" → session continues
  │   ├── New session → mkfifo + store                  ├── [REQ] [→E2E] User says "no" → session denies
  │   ├── Existing session → update status              └── [REQ]        Timeout → session denies
  │   └── Response with decision status
  ├── GET /status
  │   └── Empty map / populated map
  ├── POST /shutdown (optional)
  └── Voice: say + listen-yesno
      ├── [REQ] Voice returns "yes" → write allow JSON
      ├── [REQ] Voice returns "no" → write deny JSON
      └── [REQ] Voice times out → write deny JSON

[+] hook.sh (Bash)                                    [+] Hook execution flow
  ├── mkfifo (pre-create)                               ├── [REQ] First permission request in session
  ├── curl POST to daemon                               └── [REQ] Daemon not running → hook falls through
  └── cat FIFO (timeout 30s) → echo decision            (graceful fallback)

[+] listen-yesno.swift                                  [+] Voice input
  ├── [REQ] Recognize "yes" → exit 0
  ├── [REQ] Recognize "no" → exit 1
  ├── [REQ] Timeout → exit 2
  └── [REQ] Speech framework unavailable → exit 2

COVERAGE GOAL: 16/16 paths  |  E2E tests: 2  |  Unit tests: 14
```

**Test requirements:**
1. **daemon.ts** — Unit test session map CRUD, FIFO creation, decision JSON writing, missing FIFO handling
2. **hook.sh** — Integration test: mock daemon with `nc -l`, verify hook output matches Claude's expected JSON format
3. **hook.sh** — Test with special characters in prompt (quotes, backslashes, newlines)
4. **listen-yesno.swift** — Manual test on macOS (Speech framework requires real audio input, hard to unit test)

## Performance Notes

- O(1) per request — map lookup + FIFO write
- No database, no caching needed
- **Session map leak:** If SessionEndHook fails to fire, stale entries accumulate. Daemon should periodically purge entries >1 hour old.

## Phase 2 (Future)

- Plan approval / plan review via voice
- Session summary announcement on idle
- Voice commands beyond yes/no ("approve all git commands", "pause session 3")
- Tray app with visual session status
- Apple Intelligence integration (if/when APIs available)
