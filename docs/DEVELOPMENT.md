# Development

## Project Structure

```
codyclaude-watch/
├── daemon.ts          # Bun HTTP server
├── hook.sh          # Claude Code hook
├── install.sh        # One-command installer
├── .codywatcher/
│   └── listen-yesno.swift  # Voice binary source
├── docs/
├── test-scripts/
└── .planning/
```

## Running Locally

```bash
# Install dependencies
bun install

# Run daemon
bun run daemon.ts

# Test hook manually
SESSION_ID="test-$$"
mkfifo "/tmp/codywatcher/sessions/${SESSION_ID}.fifo"
~/.codywatcher/bin/hook.sh "$SESSION_ID" "Bash" "test command"
```

## Building listen-yesno

```bash
cd .codywatcher
swiftc -framework Speech -framework AVFoundation listen-yesno.swift -o listen-yesno
```

## Daemon Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/notify` | POST | Receive permission request |
| `/status` | GET | List pending sessions |
| `/test-stale-cleanup` | POST | Test stale session purging |
| `/test-fifo-write` | POST | Test FIFO write |

## Testing Changes

After modifying daemon.ts:
```bash
# Kill existing daemon
kill $(lsof -ti :18765)

# Restart with new code
bun run daemon.ts
```

## Logging

Daemon logs to `~/.codywatcher/logs/daemon.log` when run via LaunchAgent. For verbose output, run manually: