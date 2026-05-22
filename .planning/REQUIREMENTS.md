# Requirements: CodyWatcher

**Defined:** 2026-05-23
**Core Value:** Users can manage permission approvals across multiple Claude Code sessions via voice without leaving their current tab

## v1 Requirements

### Daemon

- [ ] **DAEMON-01**: Bun HTTP server listens on localhost:18765 with session map state
- [ ] **DAEMON-02**: POST /notify receives permission requests and stores them in session map
- [ ] **DAEMON-03**: Daemon creates per-session FIFO on first /notify for a session ID
- [ ] **DAEMON-04**: Daemon runs macOS `say` TTS to announce pending requests
- [ ] **DAEMON-05**: Daemon runs listen-yesno Swift binary for voice recognition
- [ ] **DAEMON-06**: Daemon writes allow/deny/timeout decision JSON to session FIFO
- [ ] **DAEMON-07**: GET /status returns active pending requests for debugging
- [ ] **DAEMON-08**: Daemon purges stale session map entries older than 1 hour

### Hooks

- [ ] **HOOK-01**: PermissionRequestHook POSTs request to daemon and reads FIFO decision
- [ ] **HOOK-02**: Hook pre-creates FIFO before POSTing to daemon
- [ ] **HOOK-03**: Hook uses jq for safe JSON encoding of special characters
- [ ] **HOOK-04**: Hook includes 30-second timeout on FIFO read with fallback deny
- [ ] **HOOK-05**: Hook silences curl output, echoes only FIFO decision to stdout
- [ ] **HOOK-06**: SessionStartHook creates /tmp/codywatcher/sessions directory
- [ ] **HOOK-07**: SessionEndHook cleans up session FIFO file

### Voice

- [ ] **VOICE-01**: listen-yesno recognizes "yes" via macOS Speech framework → exit 0
- [ ] **VOICE-02**: listen-yesno recognizes "no" → exit 1
- [ ] **VOICE-03**: listen-yesno times out after 10s → exit 2
- [ ] **VOICE-04**: listen-yesno handles Speech framework unavailable → exit 2

### Installation

- [ ] **INSTALL-01**: install.sh creates ~/.codywatcher/ directory structure
- [ ] **INSTALL-02**: install.sh compiles listen-yesno.swift to binary
- [ ] **INSTALL-03**: install.sh configures hooks in settings.json
- [ ] **INSTALL-04**: install.sh sets up launchd plist for daemon persistence

### Security

- [ ] **SEC-01**: Daemon binds to localhost only
- [ ] **SEC-02**: FIFOs use per-session UUID names in /tmp
- [ ] **SEC-03**: Daemon handles missing FIFO writes gracefully (ENOENT)

## v2 Requirements

### Voice Commands

- **VOICE-05**: "Approve all similar" voice command
- **VOICE-06**: Plan approval / plan review via voice
- **VOICE-07**: Session summary announcement on idle
- **VOICE-08**: Extended voice commands beyond yes/no

### UI

- **UI-01**: Tray app with visual session status
- **UI-02**: Apple Intelligence integration

## Out of Scope

| Feature | Reason |
|---------|--------|
| "Approve all similar" | Adds state tracking and complex voice grammar, not needed for MVP |
| Plan approval via voice | Phase 2 feature, beyond core permission approval value |
| Session summary announcement | Phase 2 feature, nice-to-have not core |
| Extended voice commands | Phase 2, requires complex voice grammar system |
| Tray app | Phase 2, separate UI component |
| Apple Intelligence integration | Depends on external API availability |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DAEMON-01 | Phase 1 | Pending |
| DAEMON-02 | Phase 1 | Pending |
| DAEMON-03 | Phase 1 | Pending |
| DAEMON-04 | Phase 1 | Pending |
| DAEMON-05 | Phase 2 | Pending |
| DAEMON-06 | Phase 2 | Pending |
| DAEMON-07 | Phase 1 | Pending |
| DAEMON-08 | Phase 1 | Pending |
| HOOK-01 | Phase 1 | Pending |
| HOOK-02 | Phase 1 | Pending |
| HOOK-03 | Phase 1 | Pending |
| HOOK-04 | Phase 1 | Pending |
| HOOK-05 | Phase 1 | Pending |
| HOOK-06 | Phase 1 | Pending |
| HOOK-07 | Phase 1 | Pending |
| VOICE-01 | Phase 2 | Pending |
| VOICE-02 | Phase 2 | Pending |
| VOICE-03 | Phase 2 | Pending |
| VOICE-04 | Phase 2 | Pending |
| INSTALL-01 | Phase 3 | Pending |
| INSTALL-02 | Phase 3 | Pending |
| INSTALL-03 | Phase 3 | Pending |
| INSTALL-04 | Phase 3 | Pending |
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-05-23*
*Last updated: 2026-05-23 after initial definition*
