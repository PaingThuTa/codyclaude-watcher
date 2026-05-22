---
wave: 1
depends_on: null
files_modified:
  - install.sh
autonomous: false
requirements_addressed:
  - INSTALL-01
  - INSTALL-02
  - INSTALL-03
  - INSTALL-04
---

# Plan 03-01: Complete install.sh for Phase 3

<objective>
Create a fully functional install.sh that sets up the complete CodyWatcher environment: directory structure, all binaries, hook configuration, and LaunchAgent persistence.
</objective>

## Tasks

### 01: Create ~/.codywatcher directory structure
<read_first>
- .planning/phases/03-installation-persistence/03-CONTEXT.md (decisions INST-01)
</read_first>

<action>
Create the following directory structure in the user's home directory:
- ~/.codywatcher/bin/ — for daemon and binaries
- ~/.codywatcher/config/ — for configuration files
- ~/.codywatcher/state/ — for session state
- ~/.codywatcher/log/ — for daemon stdout/stderr

Use: mkdir -p ~/.codywatcher/{bin,config,state,log}
</action>

<acceptance_criteria>
- ~/.codywatcher/bin/ exists
- ~/.codywatcher/config/ exists
- ~/.codywatcher/state/ exists
- ~/.codywatcher/log/ exists
</acceptance_criteria>

### 02: Copy project files to ~/.codywatcher/bin/
<read_first>
- install.sh (to understand current state)
</read_first>

<action>
Copy the following files from the project root to ~/.codywatcher/bin/:
- daemon.ts
- hook.sh

These files already exist in the project root. The install script will copy them during installation.
</action>

<acceptance_criteria>
- ~/.codywatcher/bin/daemon.ts exists after install
- ~/.codywatcher/bin/hook.sh exists after install
</acceptance_criteria>

### 03: Compile listen-yesno.swift to binary
<read_first>
- .planning/phases/02-voice-recognition-integration/ (listen-yesno.swift source)
</read_first>

<action>
Compile the Swift binary using:
swiftc ~/.codywatcher/bin/listen-yesno.swift -o ~/.codywatcher/bin/listen-yesno -framework SpeechSynthesis -framework SpeechRecognition

This creates the binary from the Swift source file.
</action>

<acceptance_criteria>
- ~/.codywatcher/bin/listen-yesno binary exists and is executable
- Binary responds to --help or similar without errors
</acceptance_criteria>

### 04: Merge hooks into ~/.cody-claude/settings.json
<read_first>
- .planning/phases/03-installation-persistence/03-CONTEXT.md (INST-03 merge strategy)
</read_first>

<action>
Read existing ~/.cody-claude/settings.json, merge hooks object with jq, write back. Hook paths must be absolute: ~/.codywatcher/bin/hook.sh for PermissionRequestHook. Preserve existing keys during merge.
</action>

<acceptance_criteria>
- ~/.cody-claude/settings.json contains PermissionRequestHook pointing to ~/.codywatcher/bin/hook.sh
- Existing settings preserved (not overwritten)
- Valid JSON after merge
</acceptance_criteria>

### 05: Create and install LaunchAgent plist
<read_first>
- .planning/phases/03-installation-persistence/03-CONTEXT.md (INST-04, INST-05)
</read_first>

<action>
Create ~/Library/LaunchAgents/com.codysecret1.codywatcher.plist with:
- Label: com.codysecret1.codywatcher
- ProgramArguments: /Users/codysecret1/.codywatcher/bin/launch-daemon.sh
- RunAtLoad: true
- KeepAlive: false

Install via: launchctl load ~/Library/LaunchAgents/com.codysecret1.codywatcher.plist
</action>

<acceptance_criteria>
- ~/Library/LaunchAgents/com.codysecret1.codywatcher.plist exists
- launchctl list shows com.codysecret1.codywatcher
</acceptance_criteria>

### 06: Verify end-to-end installation
<read_first>
- .planning/ROADMAP.md (Phase 3 success criteria)
</read_first>

<action>
Run curl http://localhost:18765/status and verify 200 response. Also verify:
- Daemon process running (check launchctl)
- Hook script executable
- listen-yesno binary responds
</action>

<acceptance_criteria>
- curl localhost:18765/status returns 200
- LaunchAgent listed in launchctl list
- Binary files are executable
</acceptance_criteria>

## Verification

Run the install script on a clean environment:
1. ./install.sh from project root
2. Verify ~/.codywatcher/ structure created
3. Verify hooks merged in settings.json
4. Verify LaunchAgent loaded
5. Verify daemon responds to /status endpoint

## must_haves

- install.sh creates ~/.codywatcher/ with bin/config/state/log directories
- listen-yesno.swift compiles to executable binary
- Hooks configured in settings.json with absolute paths
- LaunchAgent plist installed and loaded
- Daemon running and responding to /status