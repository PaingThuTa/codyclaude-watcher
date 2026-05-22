# Configuration

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CODYWATCHER_KEY` | No | Auth key for daemon-hook communication |

When set, both daemon and hook must have the same key. Dev mode (unset) disables auth.

## Daemon Ports

- **Default**: `18765` (hardcoded in daemon.ts)
- **Host**: `127.0.0.1` (localhost only)

## Timeouts

| Timeout | Default | Configurable |
|---------|---------|-------------|
| Voice listen | 15s | Via `timeout` param in `spawnListenYesno` |
| FIFO read (hook) | 30s | `FIFO_TIMEOUT` in hook.sh |
| Stale session purge | 1h | `STALE_THRESHOLD_MS` in daemon.ts |

## Directories

| Path | Created By |
|------|----------|
| `~/.codywatcher/` | install.sh |
| `~/.codywatcher/bin/` | install.sh |
| `~/.codywatcher/logs/` | install.sh |
| `/tmp/codywatcher/sessions/` | daemon or hook |

## Files

| File | Purpose |
|------|---------|
| `~/.codywatcher/bin/daemon.ts` | HTTP server |
| `~/.codywatcher/bin/hook.sh` | Claude hook |
| `~/.codywatcher/bin/listen-yesno` | Swift voice binary |
| `~/.codywatcher/logs/daemon.log` | Daemon output log |
| `~/Library/LaunchAgents/com.codysecret1.codywatcher.plist` | LaunchAgent |

## Hook Configuration

The hook is configured in `~/.cody-claude/settings.json`:

```json
{
  "permissionHooks": {
    "PermissionRequestHook": "~/.codywatcher/bin/hook.sh"
  }
}
```

The installer merges this automatically. Manual steps:

1. Open `~/.cody-claude/settings.json`
2. Add `permissionHooks.PermissionRequestHook` pointing to `~/.codywatcher/bin/hook.sh`
3. Set `defaultMode: "default"` to enable permission prompts

## Security

- Daemon binds localhost only — no network exposure
- FIFOs use per-session UUID names in `/tmp`
- Graceful ENOENT handling if FIFO missing

---
*VERIFY: All paths and values match actual implementation*