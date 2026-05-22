# Phase 3: Installation & Persistence - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

One-command setup that builds, configures, and persists the daemon. User runs `install.sh` and everything works. Creates ~/.codywatcher/ directory with all files, compiles listen-yesno.swift to binary, configures hooks in settings.json, installs launchd plist so daemon starts on login, verifies fresh install → daemon running → first permission request works with voice.

</domain>

<decisions>
## Implementation Decisions

### Directory Structure
- **INST-01:** Organized `~/.codywatcher/` structure: `~/.codywatcher/bin/`, `~/.codywatcher/config/`, `~/.codywatcher/state/`. Daemon source and compiled binary go in bin/, configuration in config/, session state in state/.

### Swift Build Method
- **INST-02:** Direct `swiftc` command. Simple one-liner: `swiftc listen-yesno.swift -o listen-yesno -framework SpeechSynthesis -framework SpeechRecognition`. No project files needed.

### Settings Merge Strategy
- **INST-03:** Merge hooks into existing settings.json. Read existing file, merge hooks object with existing keys, write back. Preserves user customizations.

### Launchd Agent Type
- **INST-04:** User LaunchAgent (not BackgroundOnly). Lives at `~/Library/LaunchAgents/com.codysecret1.codywatcher.plist`. Runs on demand when triggered, more efficient than continuous background service.

### Daemon Startup Timing
- **INST-05:** Start on install. install.sh loads the LaunchAgent via `launchctl load` after creating plist. Daemon starts automatically on login.

### Previously Decided (from Phase 1 Context)
- Daemon listens on localhost:18765
- FIFO pre-created in hook.sh
- jq for JSON encoding
- 30-second FIFO timeout
- toolName-only TTS prompts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Goal & Requirements
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria, requirement IDs
- `.planning/REQUIREMENTS.md` — INSTALL-01, INSTALL-02, INSTALL-03, INSTALL-04 requirements

### Prior Phase Context
- `.planning/phases/01-core-daemon-hooks/01-CONTEXT.md` — Phase 1 decisions (FIFO, daemon port, TTS behavior)

### Project Spec
- `.planning/PROJECT.md` — Key decisions, constraints, context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No source code written yet — greenfield for Phase 3.
- Files to create: install.sh, daemon.ts (from Phase 1-2), listen-yesno.swift (from Phase 2), hook scripts (from Phase 1).
- Phase 1 and 2 context defines all the runtime components that install.sh will package.

### Integration Points
- ~/.cody-claude/settings.json — hook configuration target
- ~/Library/LaunchAgents/ — launchd plist destination
- ~/.codywatcher/ — installation root directory

</code_context>

<specifics>
## Specific Ideas

- Install script: `install.sh` in project root copies files to ~/.codywatcher/
- Hook paths in settings.json: absolute paths to ~/.codywatcher/bin/
- LaunchAgent plist: RunAtLoad=true, KeepAlive=false (on-demand)
- Verification: After install, curl localhost:18765/status returns 200

</specifics>

<deferred>
## Deferred Ideas

- Uninstall script — future phase
- Upgrade procedure — future phase
- Homebrew tap — future phase

</deferred>

---

*Phase: 03-installation-persistence*
*Context gathered: 2026-05-23*