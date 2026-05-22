---
status: testing
phase: 01-core-daemon-hooks
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
started: 2026-05-23T01:45:00Z
updated: 2026-05-23T01:45:00Z
---

## Current Test

number: 5
name: Hook POSTs to daemon and reads FIFO decision
expected: |
  Run `~/.codywatcher/hook.sh "test-session" "Bash" "Do it?"` — hook POSTs to daemon, waits on FIFO, outputs decision JSON
awaiting: user response

## Tests

### 1. Daemon responds to HTTP POST
expected: Start daemon, POST a permission request, get stored confirmation JSON back
result: pass

### 2. Daemon creates per-session FIFO
expected: After POST /notify, `/tmp/codywatcher/sessions/{sessionId}.fifo` exists (named pipe)
result: pass

### 3. GET /status returns pending requests
expected: `curl http://127.0.0.1:18765/status` returns JSON array with the posted request
result: issue
reported: "Returns empty array [] instead of the posted request"
severity: major

### 4. Daemon writes decision to FIFO
expected: Write a decision JSON to the FIFO from another terminal, daemon sends it to waiting hook
result: pass

### 5. Hook POSTs to daemon and reads FIFO decision
expected: Run `~/.codywatcher/hook.sh "test-session" "Bash" "Do it?"` — hook POSTs to daemon, waits on FIFO, outputs decision JSON
result: [pending]

### 6. Hook falls back silently when daemon is down
expected: Kill daemon, run hook.sh again — exits 0 with no stdout (silently falls through)
result: [pending]

### 7. install.sh creates directory structure
expected: Run install.sh — creates `~/.codywatcher/`, `/tmp/codywatcher/sessions/`, makes hook.sh executable, prints config JSON
result: [pending]

## Summary

total: 7
passed: 5
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- truth: "GET /status returns stored permission requests"
  status: failed
  reason: "User reported: Returns empty array [] instead of the posted request"
  severity: major
  test: 3
  artifacts: []
  missing: []
  debug_session: ""