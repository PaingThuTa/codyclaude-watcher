---
phase: 01-core-daemon-hooks
verified: 2026-05-23T12:00:00Z
status: human_needed
score: 12/13 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Daemon runs macOS say TTS to announce pending requests (DAEMON-04)"
    status: failed
    reason: "No TTS code found in daemon.ts. DAEMON-04 is listed as a Phase 1 requirement in ROADMAP.md and REQUIREMENTS.md traceability table, but neither plan 01-01 nor plan 01-02 claims it, and no say/TTS/announce code exists in daemon.ts."
    artifacts:
      - path: "~/.codywatcher/daemon.ts"
        issue: "No TTS implementation -- no 'say' command calls, no announce function"
    missing:
      - "Add TTS announcement to POST /notify handler or writeDecision function"
deferred: []
human_verification:
  - test: "End-to-end hook to daemon to FIFO to decision flow"
    expected: "Hook outputs decision JSON from FIFO, daemon stores session, GET /status shows pending request"
    why_human: "Requires running daemon process, writing to FIFO from separate terminal, and verifying hook output -- cannot be tested with static analysis or grep"
  - test: "Daemon-down fallback behavior"
    expected: "Hook exits silently with no stdout when daemon is not running"
    why_human: "Requires killing daemon and running hook.sh to verify silent exit"
  - test: "install.sh creates directory structure and prints config"
    expected: "~/.codywatcher/ exists, hook.sh is executable, config JSON printed to stdout"
    why_human: "Requires running install.sh and verifying file system state"
  - test: "SessionStartHook creates /tmp/codywatcher/sessions directory"
    expected: "Directory exists after session start"
    why_human: "Requires Claude Code session with hooks configured to verify"
  - test: "SessionEndHook cleans up session FIFO file"
    expected: "FIFO file removed after session ends"
    why_human: "Requires Claude Code session with hooks configured to verify"
---

# Phase 1: Core Daemon & Hooks Verification Report

**Phase Goal:** Working daemon + hook integration that routes permission requests through localhost. Full HTTP/FIFO plumbing must work -- no voice yet. The daemon accepts POST /notify, stores requests, writes decisions to FIFO. Hook script POSTs to daemon, blocks on FIFO, echoes decision to stdout. End-to-end: notify -> daemon stores -> FIFO write -> hook unblocks. GET /status returns active pending requests. Daemon gracefully handles missing FIFO and stale session cleanup. No breakage when daemon not running -- hook falls through to normal Claude behavior.

**Verified:** 2026-05-23T12:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Daemon accepts POST /notify and stores request in session map | VERIFIED | daemon.ts lines 97-138: validates JSON body, upserts into `sessionMap`, returns `{status: "stored", sessionId}` |
| 2 | Daemon creates per-session FIFO in /tmp/codywatcher/sessions/ | VERIFIED | daemon.ts lines 30-36: `createFifo()` uses `mkfifo` via Bun.$, checks existence first |
| 3 | Daemon writes decision JSON to FIFO on demand | VERIFIED | daemon.ts lines 38-66: `writeDecision()` opens FIFO, writes Claude-compatible JSON, catches ENOENT |
| 4 | GET /status returns JSON array of pending requests | VERIFIED | daemon.ts lines 141-146: returns `JSON.stringify(Array.from(sessionMap.values()))` |
| 5 | Stale sessions (>1 hour) are purged automatically | VERIFIED | daemon.ts lines 68-87: `purgeStaleSessions()` runs on 15-min `setInterval`, removes entries >3600000ms old |
| 6 | Missing FIFO write is caught gracefully (ENOENT), daemon does not crash | VERIFIED | daemon.ts lines 59-65: try/catch around `fs.openSync`, catches `err?.code === "ENOENT"` |
| 7 | Daemon binds to localhost:18765 only | VERIFIED | daemon.ts lines 5-6, 89-91: `HOST = "127.0.0.1"`, `port: PORT`, `hostname: HOST` in `Bun.serve()` |
| 8 | Hook pre-creates FIFO before POSTing to daemon | VERIFIED | hook.sh lines 23-25: `mkdir -p`, `[ -p "$FIFO" ] || mkfifo "$FIFO"` |
| 9 | Hook POSTs permission request to daemon using jq-safe JSON | VERIFIED | hook.sh lines 28-32: `jq -n --arg` encoding, lines 34-42: curl POST with 2s connect timeout |
| 10 | Hook blocks on FIFO read with 30-second timeout | VERIFIED | hook.sh line 50: `timeout "$FIFO_TIMEOUT" cat "$FIFO"` with `FIFO_TIMEOUT=30` |
| 11 | Hook outputs only FIFO decision to stdout (curl silenced) | VERIFIED | hook.sh line 34: `curl -s -o /dev/null -w "%{http_code}"`, line 56: only `echo "$DECISION"` writes stdout |
| 12 | Hook falls through silently when daemon is not running | VERIFIED | hook.sh lines 39-47: curl failure exits 0, non-200 response exits 0, no stdout in either path |
| 13 | Daemon runs macOS say TTS to announce pending requests (DAEMON-04) | FAILED | No TTS code in daemon.ts. No `say` command, no announce function, no tts references anywhere in Phase 1 artifacts. |

**Score:** 12/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `~/.codywatcher/daemon.ts` | Bun HTTP server with /notify, /status routes, session map, FIFO lifecycle | VERIFIED | 194 lines, substantive implementation, exports server and functions |
| `~/.codywatcher/daemon.test.ts` | Unit tests for session CRUD, FIFO creation, missing FIFO, status endpoint | VERIFIED | 235 lines, 13 test cases across 6 describe blocks |
| `~/.codywatcher/hook.sh` | PermissionRequestHook script: FIFO pre-create, curl POST, FIFO read with timeout | VERIFIED | 56 lines, executable (chmod +x), bash syntax valid |
| `~/.codywatcher/install.sh` | Setup script: creates directory structure, documents hook configuration | VERIFIED | 79 lines, executable (chmod +x), bash syntax valid |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `~/.codywatcher/hook.sh` | `http://localhost:18765/notify` | curl POST with jq-encoded JSON | WIRED | hook.sh line 37: `curl -X POST "$DAEMON_URL"` with `DAEMON_URL="http://localhost:18765/notify"` |
| `~/.codywatcher/hook.sh` | `/tmp/codywatcher/sessions/{sessionId}.fifo` | mkfifo + timeout 30 cat | WIRED | hook.sh line 24-25: FIFO path construction + mkfifo, line 50: `timeout "$FIFO_TIMEOUT" cat "$FIFO"` |
| `~/.codywatcher/daemon.ts` | `/tmp/codywatcher/sessions/{sessionId}.fifo` | mkfifo + fs.openSync write | WIRED | daemon.ts line 27: `getFifoPath()` constructs path, line 34: `mkfifo`, line 56: `fs.openSync(fifoPath, "w")` |
| `~/.codywatcher/daemon.ts` | `localhost:18765` | Bun.serve port binding | WIRED | daemon.ts lines 5-6, 89-91: `PORT=18765`, `HOST="127.0.0.1"`, `Bun.serve({port, hostname})` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `daemon.ts` sessionMap | `sessionMap` (Map<string, PendingRequest>) | POST /notify request body | Yes -- entries stored from parsed JSON body with sessionId, tool, prompt, status, timestamp | FLOWING |
| `daemon.ts` GET /status | `Array.from(sessionMap.values())` | sessionMap | Yes -- returns actual stored entries as JSON array | FLOWING |
| `daemon.ts` writeDecision | `payload` (constructed JSON) | decision parameter + sessionId | Yes -- constructs Claude-compatible decision JSON dynamically | FLOWING |
| `hook.sh` DECISION | `timeout cat "$FIFO"` | FIFO file | Yes -- reads actual decision written by daemon or other process | FLOWING |
| `hook.sh` BODY | `jq -n --arg ...` | $1, $2, $3 arguments | Yes -- dynamically encodes hook arguments into JSON | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| hook.sh syntax valid | `bash -n hook.sh` | exit 0 | PASS |
| install.sh syntax valid | `bash -n install.sh` | exit 0 | PASS |
| hook.sh executable | `ls -la hook.sh` | `-rwxr-xr-x` | PASS |
| install.sh executable | `ls -la install.sh` | `-rwxr-xr-x` | PASS |
| daemon.test.ts test count | `grep -c "it(" daemon.test.ts` | 13 tests | PASS |
| No debt markers (TBD/FIXME/XXX) in daemon.ts | grep scan | No matches | PASS |
| No debt markers in hook.sh | grep scan | No matches | PASS |
| No stub patterns (return null/empty) in daemon.ts | grep scan | No matches | PASS |
| No placeholder comments in any artifact | grep scan | No matches | PASS |

### Probe Execution

No probes declared for Phase 1. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DAEMON-01 | 01-01 | Bun HTTP server on localhost:18765 | SATISFIED | daemon.ts: `Bun.serve({port: 18765, hostname: "127.0.0.1"})` |
| DAEMON-02 | 01-01 | POST /notify stores request in session map | SATISFIED | daemon.ts lines 97-138: validates, upserts, returns stored |
| DAEMON-03 | 01-01 | Daemon creates per-session FIFO on first /notify | SATISFIED | daemon.ts lines 30-36: `createFifo()` called in /notify handler |
| DAEMON-04 | 01-01 | Daemon runs macOS say TTS to announce pending requests | BLOCKED | No TTS code exists in daemon.ts or any Phase 1 artifact |
| DAEMON-07 | 01-01 | GET /status returns JSON array | SATISFIED | daemon.ts lines 141-146: returns session map values as JSON array |
| DAEMON-08 | 01-01 | Stale sessions purged after 1 hour | SATISFIED | daemon.ts lines 68-87: `purgeStaleSessions()` on 15-min interval |
| HOOK-01 | 01-02 | PermissionRequestHook POSTs to daemon and reads FIFO | SATISFIED | hook.sh: curl POST + timeout cat FIFO |
| HOOK-02 | 01-02 | Hook pre-creates FIFO before POSTing | SATISFIED | hook.sh line 25: `[ -p "$FIFO" ] || mkfifo "$FIFO"` |
| HOOK-03 | 01-02 | Hook uses jq for safe JSON encoding | SATISFIED | hook.sh lines 28-32: `jq -n --arg` pattern |
| HOOK-04 | 01-02 | Hook includes 30-second timeout on FIFO read | SATISFIED | hook.sh line 50: `timeout "$FIFO_TIMEOUT" cat` with `FIFO_TIMEOUT=30` |
| HOOK-05 | 01-02 | Hook silences curl output, echoes only FIFO decision | SATISFIED | hook.sh line 34: `-o /dev/null`, line 56: only `echo "$DECISION"` |
| HOOK-06 | 01-02 | SessionStartHook creates /tmp/codywatcher/sessions directory | SATISFIED | install.sh lines 57-59: prints SessionStartHook config with `mkdir -p` |
| HOOK-07 | 01-02 | SessionEndHook cleans up session FIFO file | SATISFIED | install.sh lines 61-63: prints SessionEndHook config with `rm -f` |
| SEC-01 | 01-01 | Daemon binds to localhost only | SATISFIED | daemon.ts: `HOST = "127.0.0.1"`, `hostname: HOST` |
| SEC-02 | 01-01 | FIFOs use per-session UUID names in /tmp | SATISFIED | daemon.ts line 27: `path.join(SESSIONS_DIR, sessionId + ".fifo")` |
| SEC-03 | 01-01 | Daemon handles missing FIFO writes gracefully | SATISFIED | daemon.ts lines 59-65: ENOENT catch in writeDecision |

### Anti-Patterns Found

No anti-patterns detected. No debt markers (TBD/FIXME/XXX), no placeholder comments, no empty implementations, no hardcoded empty data.

### Gaps Summary

One gap blocks full Phase 1 goal achievement:

**DAEMON-04 (TTS Announcement) is not implemented.** The ROADMAP.md Phase 1 requirements list includes DAEMON-04 ("Daemon runs macOS `say` TTS to announce pending requests"), and the REQUIREMENTS.md traceability table maps it to Phase 1. However, neither plan 01-01 nor plan 01-02 claims this requirement, and no TTS code exists in daemon.ts. The CONTEXT.md references TTS as a Phase 1 plumbing component but the actual `say` command invocation was never added.

This is a gap because the Phase 1 goal states "Working daemon + hook integration" and DAEMON-04 is explicitly listed as a Phase 1 requirement in the roadmap contract. However, the core HTTP/FIFO plumbing is fully functional without TTS -- the gap is an announcement feature, not a plumbing failure.

### Human Verification Required

The Phase 1 plan includes a `checkpoint:human-verify` task (Task 3) for end-to-end verification. The following items require human testing:

1. **End-to-end hook to daemon to FIFO to decision flow**
   - Start daemon: `bun run ~/.codywatcher/daemon.ts &`
   - Run hook: `~/.codywatcher/hook.sh "e2e-test-session" "Bash" "Do you want to run git status?"`
   - Verify daemon receives POST via `curl -s http://127.0.0.1:18765/status`
   - Write decision to FIFO from terminal
   - Verify hook outputs decision JSON

2. **Daemon-down fallback behavior**
   - Kill daemon, run hook again
   - Verify hook exits silently with no stdout output

3. **install.sh directory structure and config output**
   - Run `~/.codywatcher/install.sh`
   - Verify ~/.codywatcher/ exists, hook.sh is executable, config JSON printed

4. **SessionStartHook creates /tmp/codywatcher/sessions**
   - Requires Claude Code session with hooks configured

5. **SessionEndHook cleans up session FIFO file**
   - Requires Claude Code session with hooks configured

---

_Verified: 2026-05-23T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
