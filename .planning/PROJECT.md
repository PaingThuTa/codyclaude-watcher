# CodyWatcher

## What This Is

A local macOS daemon that monitors Claude Code permission requests across concurrent sessions, announces them via macOS TTS, captures voice input for approval/denial, and feeds the decision back to the blocked session. Eliminates the need to manually switch between Ghostty tabs when running 3-4 concurrent Claude Code sessions.

## Core Value

Users can manage permission approvals across multiple Claude Code sessions via voice without leaving their current tab.

## Requirements

### Validated

- [x] **DAEMON-01**: Bun HTTP server on localhost:18765 — v1.0
- [x] **DAEMON-02**: POST /notify stores requests — v1.0
- [x] **DAEMON-03**: Per-session FIFO creation — v1.0
- [x] **DAEMON-06**: FIFO decision writing — v1.0
- [x] **DAEMON-07**: GET /status endpoint — v1.0
- [x] **DAEMON-08**: Stale session cleanup — v1.0
- [x] **HOOK-01**: PermissionRequestHook integration — v1.0
- [x] **HOOK-02**: FIFO pre-creation — v1.0
- [x] **HOOK-03**: jq for JSON encoding — v1.0
- [x] **HOOK-04**: 30s timeout + fallback — v1.0
- [x] **HOOK-05**: Silent curl output — v1.0
- [x] **INSTALL-01**: install.sh creates ~/.codywatcher/ — v1.0

### Active

- [ ] **DAEMON-04**: macOS `say` TTS for pending requests
- [ ] **DAEMON-05**: Daemon runs listen-yesno for voice recognition
- [ ] **HOOK-06**: SessionStartHook creates sessions directory
- [ ] **HOOK-07**: SessionEndHook cleans up FIFO
- [ ] **VOICE-01**: listen-yesno "yes" → exit 0
- [ ] **VOICE-02**: listen-yesno "no" → exit 1
- [ ] **VOICE-03**: listen-yesno timeout → exit 2
- [ ] **VOICE-04**: Speech unavailable handling
- [ ] **INSTALL-02**: install.sh compiles listen-yesno to binary
- [ ] **INSTALL-03**: install.sh merges hooks in settings.json
- [ ] **INSTALL-04**: install.sh sets up LaunchAgent plist
- [ ] **SEC-01**: Daemon binds to localhost only
- [ ] **SEC-02**: FIFOs use per-session UUID
- [ ] **SEC-03**: Daemon handles ENOENT gracefully

### Out of Scope

- "Approve all similar" voice command — adds state tracking not needed for MVP
- Plan approval via voice — beyond core permission value
- Session summary announcement — nice-to-have
- Extended voice commands beyond yes/no — Phase 2+
- Tray app — separate UI component
- Apple Intelligence integration — external API

## Context

- User runs 3-4 concurrent Claude Code sessions in Ghostty
- Phase 1 delivered daemon + hooks + FIFO plumbing
- Phase 2 voice integration in progress (1/2 plans)
- Tech stack: Bun daemon, Swift listen-yesno, Hook scripts
- Deferrals: Phase 2 voice loop, live session verification, security hardening
- v1.0 shipped with 13/26 requirements validated (50%)

## Next Milestone Goals

**v1.1 Voice Complete** — Complete Phase 2 voice loop + security hardening

1. Finish voice loop orchestration in daemon (listen-yesno integration)
2. Complete security requirements (SEC-01, SEC-02, SEC-03)
3. Complete installation hooks automation (INSTALL-02, INSTALL-03, INSTALL-04)
4. Live session verification (HOOK-06, HOICE-07)

**Sound Notifications Feature** — Ringtone + alerts for all Claude interruptions

1. Ringtone on permission request
2. Ringtone on edit requests
3. Ringtone on Claude stop/interrupt events

## Constraints

- **Platform**: macOS only — depends on `say` TTS and Speech framework
- **Runtime**: Bun for daemon
- **Voice**: On-device speech recognition only — no cloud APIs
- **Security**: localhost-only HTTP — no network exposure

## Key Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| FIFO pre-created in hook.sh | Eliminates race condition | ✓ Good |
| jq for JSON encoding | Handles special chars in prompts | ✓ Good |
| 30-second FIFO timeout | Daemon crash = stuck session | ✓ Good |
| toolName-only TTS prompt | Full prompt is noise for TTS | ✓ Good |
| Sequential queue for requests | Parallel voice would be chaotic | ✓ Good |
| localhost-only daemon | Security boundary | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-23 after v1.0 milestone*