---
plan: 01-02
phase: 01
status: complete
completed: 2026-05-23T00:00:00Z
tasks_completed: 2
tasks_total: 2
---

# Plan 01-02 Summary: Hook Scripts

## Objective
Create the hook.sh script that integrates Claude Code's PermissionRequestHook with the daemon, plus install.sh for setup.

## What Was Built

### hook.sh (`~/.codywatcher/hook.sh`)
- **FIFO pre-create** (D-07, HOOK-02): Creates per-session FIFO before POSTing to daemon
- **jq-safe JSON** (D-08, HOOK-03): Uses `jq -n --arg` to safely encode prompt text with special characters
- **Daemon POST** (D-05, HOOK-01): curl with 2s connect timeout, silenced output
- **Graceful fallback**: When daemon is down, exits 0 silently — Claude falls through to normal prompt
- **FIFO read with timeout** (D-09, HOOK-04): `timeout 30 cat` with fallback deny JSON
- **Clean output** (D-12, HOOK-05): Only `echo "$DECISION"` writes to stdout — no curl leakage

### install.sh (`~/.codywatcher/install.sh`)
- Creates `~/.codywatcher/` and `/tmp/codywatcher/sessions/` directories
- Validates `bun` and `jq` availability (exits 1 if missing)
- Makes hook.sh executable
- Prints hook configuration JSON for settings.json (does NOT modify it automatically)
- Prints daemon startup instructions

## Requirements Met
- HOOK-01: PermissionRequestHook POSTs request to daemon and reads FIFO decision
- HOOK-02: Hook pre-creates FIFO before POSTing to daemon
- HOOK-03: Hook uses jq for safe JSON encoding of special characters
- HOOK-04: Hook includes 30-second timeout on FIFO read with fallback deny
- HOOK-05: Hook silences curl output, echoes only FIFO decision to stdout
- HOOK-06: SessionStartHook creates /tmp/codywatcher/sessions directory
- HOOK-07: SessionEndHook cleans up session FIFO file

## Self-Check: PASSED
- hook.sh syntax valid (`bash -n`)
- hook.sh executable (`chmod +x`)
- install.sh syntax valid (`bash -n`)
- install.sh executable (`chmod +x`)
- All acceptance criteria met per PLAN.md

## Key Files
- `~/.codywatcher/hook.sh` — PermissionRequestHook script
- `~/.codywatcher/install.sh` — Setup script
