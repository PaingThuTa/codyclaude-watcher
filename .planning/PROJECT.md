# CodyWatcher

## What This Is

A local macOS daemon that monitors Claude Code permission requests across concurrent sessions, announces them via macOS TTS, captures voice input for approval/denial, and feeds the decision back to the blocked session. Eliminates the need to manually switch between Ghostty tabs when running 3-4 concurrent Claude Code sessions.

## Core Value

Users can manage permission approvals across multiple Claude Code sessions via voice without leaving their current tab.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **DAEMON-01**: Bun HTTP server listens on localhost:18765 with session map state
- [ ] **DAEMON-02**: POST /notify receives permission requests and stores them in session map
- [ ] **DAEMON-03**: Daemon creates per-session FIFO on first /notify for a session ID
- [ ] **DAEMON-04**: Daemon runs macOS `say` TTS to announce pending requests
- [ ] **DAEMON-05**: Daemon runs listen-yesno Swift binary for voice recognition
- [ ] **DAEMON-06**: Daemon writes allow/deny/timeout decision JSON to session FIFO
- [ ] **DAEMON-07**: GET /status returns active pending requests for debugging
- [ ] **DAEMON-08**: Daemon purges stale session map entries older than 1 hour
- [ ] **HOOK-01**: PermissionRequestHook POSTs request to daemon and reads FIFO decision
- [ ] **HOOK-02**: Hook pre-creates FIFO before POSTing to daemon (eliminates race condition)
- [ ] **HOOK-03**: Hook uses jq for safe JSON encoding of special characters in prompts
- [ ] **HOOK-04**: Hook includes 30-second timeout on FIFO read with fallback deny
- [ ] **HOOK-05**: Hook silences curl output, echoes only FIFO decision to stdout
- [ ] **HOOK-06**: SessionStartHook creates /tmp/codywatcher/sessions directory
- [ ] **HOOK-07**: SessionEndHook cleans up session FIFO file
- [ ] **VOICE-01**: listen-yesno Swift binary recognizes "yes" via macOS Speech framework → exit 0
- [ ] **VOICE-02**: listen-yesno recognizes "no" → exit 1
- [ ] **VOICE-03**: listen-yesno times out after 10s → exit 2
- [ ] **VOICE-04**: listen-yesno handles Speech framework unavailable → exit 2
- [ ] **INSTALL-01**: install.sh creates ~/.codywatcher/ directory structure
- [ ] **INSTALL-02**: install.sh compiles listen-yesno.swift to binary
- [ ] **INSTALL-03**: install.sh configures hooks in ~/.cody-claude/settings.json
- [ ] **INSTALL-04**: install.sh sets up launchd plist for daemon persistence
- [ ] **SEC-01**: Daemon binds to localhost only — not accessible from network
- [ ] **SEC-02**: FIFOs use per-session UUID names in /tmp
- [ ] **SEC-03**: Daemon handles missing FIFO writes gracefully (ENOENT)

### Out of Scope

- "Approve all similar" voice command — deferred to Phase 2, adds state tracking and complex voice grammar not needed for MVP
- Plan approval / plan review via voice — Phase 2
- Session summary announcement on idle — Phase 2
- Voice commands beyond yes/no — Phase 2
- Tray app with visual session status — Phase 2
- Apple Intelligence integration — Phase 2 (depends on API availability)

## Context

- User runs 3-4 concurrent Claude Code sessions in Ghostty
- Manual tab-switching for permission prompts breaks flow
- Target platform: macOS (TTS via `say`, Speech framework for voice recognition)
- Runtime: Bun for daemon, Swift for voice binary
- Hook-based integration with Claude Code (PermissionRequestHook, SessionStartHook, SessionEndHook)
- Engineering decisions already resolved: FIFO pre-creation in hook (not daemon), jq for JSON safety, 30s FIFO timeout, toolName-only TTS prompt, sequential queue for simultaneous requests

## Constraints

- **Platform**: macOS only — depends on `say` TTS and Speech framework
- **Runtime**: Bun for daemon — already available on user's system
- **Voice**: On-device speech recognition only — no cloud APIs
- **Security**: localhost-only HTTP — no network exposure

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FIFO pre-created in hook.sh, not daemon | Eliminates race where hook's `cat` starts before daemon's `mkfifo` | ✓ Good |
| jq for JSON encoding in hook | String interpolation breaks on special chars in prompts | ✓ Good |
| 30-second timeout on FIFO read | Without it, daemon crash = permanently stuck session | ✓ Good |
| toolName-only TTS (not full prompt) | Full prompt is noise for TTS; user sees full prompt in tab | ✓ Good |
| Sequential queue for simultaneous requests | Parallel voice would be chaotic — user couldn't distinguish requests | ✓ Good |
| "Approve all similar" deferred | Not needed for MVP — adds complexity | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-23 after initialization from CodyWatcher spec*
