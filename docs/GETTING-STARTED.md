# Getting Started

## Prerequisites

- macOS (requires Speech framework and `say` TTS)
- [Bun](https://bun.sh) 1.0+
- Xcode Command Line Tools (`swiftc`)
- `jq`

## Quick Install

```bash
cd ~/.codywatcher
./install.sh
```

The installer:
1. Creates `~/.codywatcher/` directory structure
2. Compiles `listen-yesno.swift` to binary
3. Merges hooks into `~/.cody-claude/settings.json`
4. Registers LaunchAgent for daemon persistence

## Verify Installation

```bash
# Shell 1: Check daemon
curl http://localhost:18765/status

# Shell 2: Trigger a permission request
claude
```

In Claude Code, ask to run any command:
> "Run ls in the terminal"

You should hear TTS announce the request, then respond "yes" or "no".

## Manual Start (Without LaunchAgent)

```bash
bun run ~/.codywatcher/bin/daemon.ts &
```

## Troubleshooting

**No sound:**
- Check microphone permissions: System Settings → Privacy & Security → Microphone

**Hook not firing:**
- Verify `PermissionRequestHook` in settings.json
- Confirm `defaultMode: "default"` (not `bypassPermissions`)

**Daemon won't start:**
- Port may be in use: `lsof -ti :18765`