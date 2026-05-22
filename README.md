# CodyWatcher

Voice-controlled permission approvals for Claude Code. When Claude asks for permission to run a tool, CodyWatcher speaks the request aloud and listens for your voice response — "yes" or "no".

## How It Works

```
Claude Code asks for permission
        │
        ▼
  hook.sh fires (PermissionRequestHook)
        │  POST /notify → daemon
        ▼
  Cat ringtone plays on loop
  listen-yesno waits for wake word ("hello", "yo", "hey", ...)
        │
        ├── wake word heard → ringtone stops
        │       │
        │       ▼
        │   Allison: "Hey Cody, Claude wants to run [tool]. Say yes or no."
        │       │
        │       ▼
        │   listen-yesno listens for yes/no (15s, reprompts once)
        │       ├── "yes" → allow
        │       ├── "no"  → deny
        │       └── timeout → deny
        │
        └── timeout (no wake word) → ringtone stops → deny silently
        │
        ▼
  Decision written to FIFO
        │
        ▼
  hook.sh reads FIFO → returns decision JSON to Claude Code
```

## Components

| File | Purpose |
|------|---------|
| `daemon.ts` | HTTP server on `localhost:18765`. Receives permission requests, runs voice loop, writes decisions to FIFOs |
| `hook.sh` | Called by Claude Code's `PermissionRequestHook`. POSTs to daemon, reads decision from FIFO |
| `listen-yesno` | Compiled Swift binary. Listens for "yes"/"no" via macOS Speech Recognition. Exit 0=yes, 1=no, 2=unclear |
| `install.sh` | One-command setup: creates directories, compiles binary, merges hooks into settings.json |

## Installation

```bash
./install.sh
```

**This is a one-time setup.** The installer registers a macOS LaunchAgent that starts the daemon automatically every time you log in. You do not need to run `./install.sh` again or manually start the daemon after a reboot.

To verify the LaunchAgent is registered:

```bash
launchctl list | grep codywatcher
```

If you see `com.codysecret1.codywatcher` in the output, the daemon will start automatically on every login.

### When to re-run `./install.sh`

Only needed if you:
- Wiped `~/.codywatcher/` and need to reinstall
- Updated the daemon code and want the LaunchAgent to use the new version
- Reinstalled macOS

### Manual start (if not using LaunchAgent)

```bash
bun run ~/.codywatcher/bin/daemon.ts &
```

## Testing

### Step 1 — Verify the daemon is running

```bash
curl http://localhost:18765/status
```

Returns `[]` if no pending sessions (healthy). Returns a non-empty array if requests are queued.

### Step 2 — Smoke test the hook manually

This simulates what Claude Code does when it asks for permission:

```bash
SESSION_ID="test-$(date +%s)"
mkdir -p /tmp/codywatcher/sessions
mkfifo "/tmp/codywatcher/sessions/${SESSION_ID}.fifo"

~/.codywatcher/bin/hook.sh "$SESSION_ID" "Bash" "run ls -la?" &
```

You should hear: **"Session test-... requesting to run Bash"**

Then say "yes" or "no". The hook process (background `&`) will print the decision JSON and exit.

To see what the daemon received during this:

```bash
curl http://localhost:18765/status
```

### Step 3 — Real end-to-end test in Claude Code

Open a new Claude Code session with `defaultMode: default` in your settings (so Claude asks before running tools). Ask Claude to run any shell command:

> "Run ls -la in the terminal"

Claude will ask for permission → hook fires → daemon speaks → you respond with your voice → Claude proceeds or stops based on your answer.

### Daemon test endpoints

The daemon exposes internal test helpers:

```bash
# Test stale session cleanup
curl -s -X POST http://localhost:18765/test-stale-cleanup \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"old-session","age_ms":7200000}'
# → {"purged":1}

# Test FIFO write directly
FIFO=$(mktemp -u /tmp/codywatcher/sessions/test-XXXX.fifo)
mkfifo "$FIFO"
curl -s -X POST http://localhost:18765/test-fifo-write \
  -H "Content-Type: application/json" \
  -d "{\"fifoPath\":\"$FIFO\",\"decision\":{\"ok\":true}}" &
cat "$FIFO"
# → {"ok":true}
```

## Configuration

### Auth (optional)

By default the daemon runs with auth disabled (development mode). To enable:

```bash
export CODYWATCHER_KEY="your-secret-key"
bun run ~/.codywatcher/bin/daemon.ts &
```

The same key must be set in the environment where `hook.sh` runs (i.e. Claude Code's environment). Add it to your shell profile:

```bash
echo 'export CODYWATCHER_KEY="your-secret-key"' >> ~/.zshrc
```

### Timeouts

| Setting | Default | Location |
|---------|---------|----------|
| Voice listen timeout | 15s | `daemon.ts` → `spawnListenYesno` call |
| Hook FIFO read timeout | 30s | `hook.sh` → `FIFO_TIMEOUT` |
| Stale session purge | 1 hour | `daemon.ts` → `STALE_THRESHOLD_MS` |

## Stopping and Battery Impact

**Battery impact: minimal.** The daemon is a lightweight idle HTTP server — no mic, no CPU, no audio between requests. The microphone and speech recognition only run for ~30 seconds when Claude actually asks for permission. In between, everything is off.

### Stop the daemon

```bash
launchctl unload ~/Library/LaunchAgents/com.codysecret1.codywatcher.plist
```

### Start it again

```bash
launchctl load ~/Library/LaunchAgents/com.codysecret1.codywatcher.plist
```

### Disable permanently (won't auto-start on login)

```bash
launchctl unload ~/Library/LaunchAgents/com.codysecret1.codywatcher.plist
rm ~/Library/LaunchAgents/com.codysecret1.codywatcher.plist
```

Run `./install.sh` again to re-enable it later.

## Troubleshooting

**Daemon not starting — port already in use**
```bash
kill $(lsof -ti :18765)
bun run ~/.codywatcher/bin/daemon.ts &
```

**Hook fires but no voice**
- Check `listen-yesno` binary exists: `ls ~/.codywatcher/bin/listen-yesno`
- Check microphone permissions: System Settings → Privacy & Security → Microphone → grant access to Terminal/Claude Code

**Hook fires but daemon doesn't receive it**
- Confirm daemon is running: `curl http://localhost:18765/status`
- Check `CODYWATCHER_KEY` matches between hook and daemon (or leave both unset for dev mode)

**Claude never triggers the hook**
- Confirm `permissionHooks.PermissionRequestHook` is in `~/.cody-claude/settings.json`
- Confirm `defaultMode` is `default` (not `acceptEdits` or `bypassPermissions`)
- Restart Claude Code after changing settings

## Requirements

- macOS (uses `say` for TTS, Speech framework for recognition)
- [bun](https://bun.sh) 1.0+
- `jq`
- Xcode Command Line Tools (for `swiftc`)
