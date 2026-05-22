# Phase 3 Verification: Installation & Persistence

**Phase:** 03-installation-persistence
**Verification date:** 2026-05-23
**Status:** FAIL - Requirements not fully achieved

---

## Requirement Traceability

All IDs from PLAN frontmatter MUST be accounted for.

| Requirement ID | Description | Status | Evidence |
|----------------|-------------|--------|----------|
| INSTALL-01 | install.sh creates ~/.codywatcher/ directory structure | PASS | Directories exist: bin/, config/, state/, log/ |
| INSTALL-02 | install.sh compiles listen-yesno.swift to binary | PASS | Binary exists at ~/.codywatcher/bin/listen-yesno |
| INSTALL-03 | install.sh configures hooks in settings.json | FAIL | settings.json missing PermissionRequestHook |
| INSTALL-04 | install.sh sets up launchd plist for daemon persistence | PARTIAL | Plist exists but NOT loaded |

---

## Must-Haves Verification

From 03-PLAN.md `must_haves` section:

### 1. install.sh creates ~/.codywatcher/ with bin/config/state/log directories
**Status:** PASS

```bash
$ ls -la ~/.codywatcher/
drwxr-xr-x  6 codysecret1  staff   192 May 23 01:47 .
drwxr-xr-x 10 codysecret1  staff   320 May 23 01:47 ..
drwxr-xr-x  6 codysecret1  staff   192 May 23 01:47 bin/
drwxr-xr-x  6 codysecret1  staff   192 May 23 01:47 config/
drwxr-xr-x  6 codysecret1  staff   192 May 23 01:47 state/
drwxr-xr-x  6 codysecret1  staff   192 May 23 01:47 log/
```

### 2. listen-yesno.swift compiles to executable binary
**Status:** PASS (with caveat)

Binary exists but install.sh uses incorrect framework names. Actual compile uses `-framework Speech -framework AVFoundation` instead of `-framework SpeechSynthesis -framework SpeechRecognition` per 03-SUMMARY.md.

```bash
$ ls -la ~/.codywatcher/bin/listen-yesno
-rwxr-xr-x  6 codysecret1  staff  63536 May 23 01:47 ~/.codywatcher/bin/listen-yesno
```

### 3. Hooks configured in settings.json with absolute paths
**Status:** FAIL

settings.json does not contain `permissionHooks` or `PermissionRequestHook`. Only existing hooks are the original node-based hooks (pre-bash-dispatcher, doc-file-warning, etc.).

**Expected in settings.json:**
```json
{
  "permissionHooks": {
    "PermissionRequestHook": {
      "matcher": ".*",
      "command": "/Users/codysecret1/.codywatcher/bin/hook.sh '${sessionId}' '${toolName}' '${promptText}'"
    }
  }
}
```

**Actual:** No permissionHooks entry exists.

### 4. LaunchAgent plist installed and loaded
**Status:** PARTIAL

- Plist file exists: `~/Library/LaunchAgents/com.codysecret1.codywatcher.plist`
- NOT loaded: `launchctl list | grep codywatcher` returns empty
- Not running: `curl localhost:18765/status` returns empty

### 5. Daemon running and responding to /status
**Status:** FAIL

```bash
$ curl -s http://localhost:18765/status
(Daemon not responding)
```

---

## Discrepancy Analysis

### Claimed vs Actual

| Aspect | 03-SUMMARY.md Claims | Actual State |
|--------|---------------------|--------------|
| INSTALL-03 | Completed | NOT in settings.json |
| INSTALL-04 | Completed | Plist exists but NOT loaded |
| Daemon status | Running | Not responding |
| Hook configuration | Merged into settings.json | No hook entry found |

### install.sh Issues

1. **INSTALL-03 not achieved:** The jq merge command exists but was either not run or failed silently. settings.json shows no evidence of hook configuration.

2. **INSTALL-04 partial:** `launchctl load` was called but LaunchAgent is not showing in `launchctl list`. Could be:
   - Load command failed without error
   - Plist has invalid configuration
   - Daemon process exited immediately after starting

3. **Swift framework mismatch:** install.sh line 63 uses `Speech` but 03-SUMMARY.md claims fix to `SpeechSynthesis` and `SpeechRecognition`.

---

## Required Fixes

### 1. Fix settings.json hook merge
The install.sh creates proper HOOKS_JSON but jq merge apparently did not write to settings.json. Need to verify:
- settings.json path is correct
- jq merge syntax is correct
- Write permissions

### 2. Debug LaunchAgent
- Check `launchctl error <label>` for plist issues
- Check daemon logs at `~/.codywatcher/log/daemon.log`
- Verify bun path in plist is correct

### 3. Fix Swift frameworks
Change line 63 from:
```bash
swiftc listen-yesno.swift -o listen-yesno -framework Speech -framework AVFoundation
```
to:
```bash
swiftc listen-yesno.swift -o listen-yesno -framework SpeechSynthesis -framework SpeechRecognition
```

---

## Verification Command Summary

```bash
# Check directories
ls -la ~/.codywatcher/

# Check binary
ls -la ~/.codywatcher/bin/listen-yesno

# Check hook in settings
grep -A5 "permissionHooks" ~/.cody-claude/settings.json

# Check LaunchAgent
launchctl list | grep codywatcher
launchctl error com.codysecret1.codywatcher

# Check daemon
curl -v http://localhost:18765/status
cat ~/.codywatcher/log/daemon.log
```

---

**Result:** FAIL

Phase 3 cannot be marked complete. INSTALL-03 and INSTALL-04 are not verified. The install.sh script itself needs fixes before a clean install would achieve all requirements.