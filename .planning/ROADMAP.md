# CodyWatcher Roadmap

**Created:** 2026-05-23
**Total Phases:** 3
**Requirements Mapped:** 26

### Phase 1: Core Daemon & Hooks
**Goal:** Working daemon + hook integration that routes permission requests through localhost — no voice yet, but the full HTTP/FIFO plumbing works
**Success Criteria**:
1. Bun server accepts POST /notify, stores request, writes decision to FIFO
2. Hook script POSTs to daemon, blocks on FIFO, echoes decision to stdout
3. End-to-end flow works: notify → daemon stores → FIFO write → hook unblocks
4. GET /status returns active pending requests
5. Daemon gracefully handles missing FIFO and stale session cleanup
6. No breakage when daemon not running — hook falls through to normal Claude behavior

**Requirements:** DAEMON-01, DAEMON-02, DAEMON-03, DAEMON-04, DAEMON-07, DAEMON-08, HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, HOOK-06, HOOK-07, SEC-01, SEC-02, SEC-03

### Phase 2: Voice Recognition Integration
**Goal:** Complete the voice loop — macOS TTS announcements + Swift speech recognition + daemon writes decisions to FIFO based on voice input
**Success Criteria**:
1. Daemon announces pending request via `say` TTS with session ID + tool name
2. listen-yesno recognizes "yes" → exit 0, "no" → exit 1, timeout → exit 2
3. Daemon writes correct allow/deny/timeout decision JSON to FIFO based on voice exit code
4. listen-yesno handles Speech framework unavailable gracefully
5. End-to-end voice approval: TTS → user says "yes" → session continues

**Requirements:** DAEMON-05, DAEMON-06, VOICE-01, VOICE-02, VOICE-03, VOICE-04

### Phase 3: Installation & Persistence
**Goal:** One-command setup that builds, configures, and persists the daemon — user runs install.sh and everything works
**Success Criteria**:
1. install.sh creates ~/.codywatcher/ directory with all files
2. listen-yesno.swift compiles successfully to binary
3. Hooks configured in ~/.cody-claude/settings.json
4. launchd plist installed so daemon starts on login
5. Fresh install → daemon running → first permission request works with voice

**Requirements:** INSTALL-01, INSTALL-02, INSTALL-03, INSTALL-04

## Phase Build Order Rationale

Phase 1 delivers the core plumbing (daemon + hooks) that can be tested without voice. The FIFO routing and HTTP endpoints are the foundation everything else depends on.

Phase 2 layers voice on top of the working plumbing. Once the daemon can write decisions to FIFOs, voice is just another input source for those decisions.

Phase 3 packages it all together. Building install on top of working code ensures the installer is tested against real behavior, not assumptions.
