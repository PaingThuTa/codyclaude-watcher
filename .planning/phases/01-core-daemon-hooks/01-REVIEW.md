---
phase: 01-core-daemon-hooks
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - /Users/codysecret1/.codywatcher/daemon.ts
  - /Users/codysecret1/.codywatcher/daemon.test.ts
  - /Users/codysecret1/.codywatcher/hook.sh
  - /Users/codysecret1/.codywatcher/install.sh
findings:
  critical: 4
  warning: 12
  info: 3
  total: 19
status: issues_found
---

# Phase 1 Code Review

**Reviewed:** 2026-05-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files reviewed: the Bun HTTP daemon (`daemon.ts`), its test suite (`daemon.test.ts`), the shell hook (`hook.sh`), and the installer (`install.sh`). The core architecture (HTTP notification + FIFO decision channel) is sound, but several critical defects exist around path traversal, unauthenticated test endpoints, and FIFO lifecycle management. The test suite has structural issues that make it order-dependent and non-isolated.

---

## Critical Issues

### CR-01: Path Traversal via sessionId in FIFO Path Construction

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:27`
**Issue:** `getFifoPath` uses `path.join(SESSIONS_DIR, \`${sessionId}.fifo\`)`. Bun's `path.join` resolves `..` components, so a sessionId like `../../etc/cron.d` produces `/etc/cron.d.fifo`. The sessionId originates from untrusted HTTP POST body input (line 108) with no sanitization. An attacker can create FIFOs at arbitrary filesystem locations. The same traversal applies to `writeDecision` (line 43).
**Fix:**
```typescript
function getFifoPath(sessionId: string): string {
  // Reject path traversal characters
  if (sessionId.includes("..") || sessionId.includes("/") || sessionId.includes("\\")) {
    throw new Error(`Invalid sessionId: ${sessionId}`);
  }
  return path.join(SESSIONS_DIR, `${sessionId}.fifo`);
}
```

### CR-02: Test Endpoints Exposed in Production Server Without Authentication

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:149-185`
**Issue:** `/test-write-decision` and `/test-stale-cleanup` are test helpers running on the production HTTP server bound to `127.0.0.1:18765`. Any local process can call these endpoints. `/test-write-decision` writes decisions to arbitrary FIFOs (controlled by sessionId input). `/test-stale-cleanup` injects entries into the session map and triggers cleanup. These should never ship in production code.
**Fix:** Remove both endpoints from the production server. If test helpers are needed, run them on a separate port gated by an environment flag (e.g., `process.env.CODYWATCHER_TEST_MODE === "1"`).

### CR-03: Deny-by-Default on FIFO Timeout Locks Out User

**File:** `/Users/codysecret1/.codywatcher/hook.sh:51-52`
**Issue:** When the daemon is slow or unresponsive, the hook outputs `{"decision":{"behavior":"deny"}}`. This means a crashed, slow, or overloaded daemon causes ALL tool requests to be denied, effectively locking the user out of their coding session. The safe default for a permission hook should be to deny nothing and let Claude Code fall through to its normal interactive prompt.
**Fix:**
```bash
# On timeout, output nothing (no stdout) so Claude falls through to normal prompt
if [ $? -ne 0 ] || [ -z "$DECISION" ]; then
  # Exit silently -- Claude Code falls through to normal behavior
  exit 0
fi
```

### CR-04: FIFO TOCTOU Race Between Hook Pre-Creation and Daemon Write

**File:** `/Users/codysecret1/.codywatcher/hook.sh:24-25` and `/Users/codysecret1/.codywatcher/daemon.ts:30-36`
**Issue:** The hook creates the FIFO (line 25), then POSTs to the daemon (line 34). The daemon receives the POST and tries to write to the FIFO (line 56). But the hook's `cat "$FIFO"` (line 50) may not have started reading yet. A FIFO blocks on open for writing until a reader is present. If the daemon's `openSync(fifoPath, "w")` executes before `cat` opens for reading, the daemon blocks. If the daemon is single-threaded (Bun.serve is, per-request), this blocks the entire server. Meanwhile, the hook's `timeout cat` may expire waiting for data, creating a deadlock.
**Fix:** The daemon should write to the FIFO asynchronously (non-blocking) or use a different IPC mechanism. Alternatively, the daemon could open the FIFO in non-blocking mode, or use a message queue instead of FIFOs.

---

## Warnings

### WR-01: No Runtime Type Validation on JSON Body Fields

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:108-110`
**Issue:** `body.sessionId as string` is a compile-time type assertion, not a runtime check. A JSON body like `{"sessionId": 123, "tool": "Bash", "prompt": "test"}` passes the truthiness check on line 112 because `123` is truthy, but `sessionId` is a number, not a string. This propagates incorrect types into `createFifo` and `sessionMap`.
**Fix:**
```typescript
if (typeof body.sessionId !== "string" || typeof body.tool !== "string" || typeof body.prompt !== "string") {
  return new Response(JSON.stringify({ error: "Invalid field types" }), { status: 400 });
}
```

### WR-02: Session Map Has No Size Limit (DoS Risk)

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:18`
**Issue:** `sessionMap` grows unbounded. An attacker (or misconfigured client) can send thousands of unique sessionIds, filling memory. The stale cleanup runs every 15 minutes and only removes entries older than 1 hour.
**Fix:** Add a maximum size check before `sessionMap.set()` and evict the oldest entry when the limit is reached.

### WR-03: Stale Session Purge Does Not Clean Up FIFO Files

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:68-84`
**Issue:** `purgeStaleSessions` removes entries from `sessionMap` but does not delete the corresponding `.fifo` files from the filesystem. FIFO files accumulate in `/tmp/codywatcher/sessions/` indefinitely.
**Fix:** In the purge loop, after `sessionMap.delete(sessionId)`, also call `fs.unlinkSync(getFifoPath(sessionId))` wrapped in a try/catch.

### WR-04: Synchronous File I/O Blocks the Event Loop

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:56-58`
**Issue:** `fs.openSync`, `fs.writeSync`, `fs.closeSync` in `writeDecision` block the event loop. In a server handling concurrent requests, a slow disk write stalls all in-flight requests.
**Fix:** Use `fs.promises.writeFile(fifoPath, JSON.stringify(payload))` instead.

### WR-05: Error Typed as `any` Instead of `unknown`

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:59`
**Issue:** `catch (err: any)` suppresses TypeScript's type safety. Accessing `err?.code` on an `any` type provides no compile-time guarantee that `code` exists.
**Fix:**
```typescript
} catch (err: unknown) {
  if (err instanceof Error && 'code' in err && (err as { code: string }).code === "ENOENT") {
```

### WR-06: `$?` Exit Code Check Is Unreliable After Command Substitution

**File:** `/Users/codysecret1/.codywatcher/hook.sh:50-51`
**Issue:** `DECISION=$(timeout "$FIFO_TIMEOUT" cat "$FIFO" 2>/dev/null)` followed by `if [ $? -ne 0 ]` on the next line. The `$?` captures the exit status of the command substitution, but `2>/dev/null` suppresses the error output, making debugging difficult. More importantly, `timeout` returns 124 on timeout, which is correctly caught by `$? -ne 0`, but the suppressed stderr means the user never sees why the timeout occurred.
**Fix:** Remove `2>/dev/null` or redirect stderr to a log file for diagnostics.

### WR-07: No Validation of FIFO Output Before Echoing to stdout

**File:** `/Users/codysecret1/.codywatcher/hook.sh:56`
**Issue:** `echo "$DECISION"` outputs whatever was read from the FIFO without validating it is valid JSON or has the expected Claude Code hook structure. If the daemon writes corrupted or partial data, Claude Code receives malformed input.
**Fix:** Validate JSON before outputting:
```bash
if ! echo "$DECISION" | jq . >/dev/null 2>&1; then
  exit 0  # Invalid JSON -- fall through
fi
echo "$DECISION"
```

### WR-08: FIFO Files Never Cleaned Up by Hook

**File:** `/Users/codysecret1/.codywatcher/hook.sh`
**Issue:** The hook creates FIFOs (line 25) but never removes them. The `SessionEndHook` in `install.sh` line 62 attempts cleanup, but if the session ends abnormally (crash, kill signal), the FIFO persists. Over time, `/tmp/codywatcher/sessions/` accumulates stale FIFOs.
**Fix:** Add FIFO cleanup at the end of `hook.sh`:
```bash
# After reading decision, clean up
rm -f "$FIFO"
```

### WR-09: `mkdir -p` Failure Is Silent

**File:** `/Users/codysecret1/.codywatcher/hook.sh:21`
**Issue:** If `/tmp` is full or permissions are wrong, `mkdir -p "$SESSIONS_DIR"` fails. The script continues and `mkfifo` on line 25 fails, but the error is suppressed by `2>/dev/null` on line 50. The user gets a silent deny with no indication of the root cause.
**Fix:** Add error handling:
```bash
mkdir -p "$SESSIONS_DIR" || { echo "Failed to create sessions dir" >&2; exit 1; }
```

### WR-10: HTTP_CODE Comparison Fails Silently on Non-Numeric Output

**File:** `/Users/codysecret1/.codywatcher/hook.sh:44`
**Issue:** If `curl` returns something unexpected (e.g., empty string, network error text), `[ "$HTTP_CODE" -ne 200 ]` fails with a bash "integer expression expected" error. The `2>/dev/null` suppresses it, but the behavior is undefined -- the condition may evaluate to true or false depending on bash version.
**Fix:**
```bash
if ! [ "$HTTP_CODE" -eq 200 ] 2>/dev/null; then
  exit 0
fi
```

### WR-11: Test Suite Shares Global State and Is Order-Dependent

**File:** `/Users/codysecret1/.codywatcher/daemon.test.ts:7`
**Issue:** `import "./daemon"` starts the server as a side effect. All tests share the same `sessionMap`. Tests cannot run in isolation, in parallel, or in arbitrary order. The test at line 118 ("returns empty array when no sessions") is already broken because prior tests populate the map. The comment on line 119 acknowledges this.
**Fix:** Export server creation as a function instead of starting it on import. Use `beforeEach`/`afterEach` to reset `sessionMap` and create/destroy the server per test group.

### WR-12: `chmod +x` on Potentially Non-Existent File Silently Fails

**File:** `/Users/codysecret1/.codywatcher/install.sh:39`
**Issue:** `chmod +x "$CODWATCHER_DIR/hook.sh" 2>/dev/null` silently skips if hook.sh is missing. The script prints "hook.sh: not found" but continues as if setup succeeded. The user gets no clear indication that a critical file is missing.
**Fix:** Exit with an error if hook.sh is not found, or at minimum print a clear warning.

---

## Info

### IN-01: Variable Name Typo in install.sh

**File:** `/Users/codysecret1/.codywatcher/install.sh:5`
**Issue:** Variable is named `CODWATCHER_DIR` (missing 'Y'). The value `"$HOME/.codywatcher"` is correct, so this is a cosmetic issue, but it could cause confusion if someone copies the variable name elsewhere.

### IN-02: Hardcoded Configuration Values

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:5-8` and `/Users/codysecret1/.codywatcher/hook.sh:7-9`
**Issue:** PORT, HOST, SESSIONS_DIR, FIFO_TIMEOUT are hardcoded in both daemon and hook. If either file changes independently, they can drift out of sync. Consider a shared configuration file or environment variables.

### IN-03: Unused Import of `$` in daemon.ts

**File:** `/Users/codysecret1/.codywatcher/daemon.ts:1`
**Issue:** `import { $ } from "bun"` is used only in `createFifo` (line 34). The same result could be achieved with `fs` module, avoiding a shell subprocess. The `$` import also pulls in shell execution semantics that are unnecessary for a simple `mkfifo` call.

---

_Reviewed: 2026-05-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
