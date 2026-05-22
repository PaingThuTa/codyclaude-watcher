# Requirements: CodyWatcher

**Defined:** 2026-05-23
**Core Value:** Users can manage permission approvals across multiple Claude Code sessions via voice without leaving their current tab

## v1 Requirements

### Daemon

- [x] **DAEMON-01**: Bun HTTP server listens on localhost:18765 with session map state
- [x] **DAEMON-02**: POST /notify receives permission requests and stores them in session map
- [x] **DAEMON-03**: Daemon creates per-session FIFO on first /notify for a session ID
- [ ] **DAEMON-04**: Daemon runs macOS `say` TTS to announce pending requests — deferred to Phase 2
- [ ] **DAEMON-05**: Daemon runs listen-yesno Swift binary for voice recognition — deferred to Phase 2
- [x] **DAEMON-06**: Daemon writes allow/deny/timeout decision JSON to session FIFO
- [x] **DAEMON-07**: GET /status returns active pending requests for debugging
- [x] **DAEMON-08**: Daemon purges stale session map entries older than 1 hour

### Hooks

- [x] **HOOK-01**: PermissionRequestHook POSTs request to daemon and reads FIFO decision
- [x] **HOOK-02**: Hook pre-creates FIFO before POSTing to daemon
- [x] **HOOK-03**: Hook uses jq for safe JSON encoding of special characters
- [x] **HOOK-04**: Hook includes 30-second timeout on FIFO read with fallback deny
- [x] **HOOK-05**: Hook silences curl output, echoes only FIFO decision to stdout
- [ ] **HOOK-06**: SessionStartHook creates /tmp/codywatcher/sessions directory — requires live Claude session to verify
- [ ] **HOOK-07**: SessionEndHook cleans up session FIFO file — requires live Claude session to verify

### Voice

- [ ] **VOICE-01**: listen-yesno recognizes "yes" via macOS Speech framework → exit 0
- [ ] **VOICE-02**: listen-yesno recognizes "no" → exit 1
- [ ] **VOICE-03**: listen-yesno times out after 10s → exit 2
- [ ] **VOICE-04**: listen-yesno handles Speech framework unavailable → exit 2

### Installation

- [x] **INSTALL-01**: install.sh creates ~/.codywatcher/ directory structure
- [ ] **INSTALL-02**: install.sh compiles listen-yesno.swift to binary — deferred to Phase 2 (no voice yet)
- [ ] **INSTALL-03**: install.sh configures hooks in settings.json — user must review/add manually
- [ ] **INSTALL-04**: install.sh sets up launchd plist for daemon persistence — deferred

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
| DAEMON-01 | Phase 1 | Verified |
| DAEMON-02 | Phase 1 | Verified |
| DAEMON-03 | Phase 1 | Verified |
| DAEMON-04 | Phase 2 | Deferred |
| DAEMON-05 | Phase 2 | Pending |
| DAEMON-06 | Phase 1 | Verified |
| DAEMON-07 | Phase 1 | Verified |
| DAEMON-08 | Phase 1 | Verified |
| HOOK-01 | Phase 1 | Verified |
| HOOK-02 | Phase 1 | Verified |
| HOOK-03 | Phase 1 | Verified |
| HOOK-04 | Phase 1 | Verified |
| HOOK-05 | Phase 1 | Verified |
| HOOK-06 | Phase 1 | Pending (live test) |
| HOOK-07 | Phase 1 | Pending (live test) |
| VOICE-01 | Phase 2 | Pending |
| VOICE-02 | Phase 2 | Pending |
| VOICE-03 | Phase 2 | Pending |
| VOICE-04 | Phase 2 | Pending |
| INSTALL-01 | Phase 3 | Verified |
| INSTALL-02 | Phase 3 | Pending |
| INSTALL-03 | Phase 3 | Pending |
| INSTALL-04 | Phase 3 | Pending |
| SEC-01 | Phase 1 | Verified |
| SEC-02 | Phase 1 | Verified |
| SEC-03 | Phase 1 | Verified |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-05-23*
*Last updated: 2026-05-23 after initial definition*
