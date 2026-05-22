# CodyWatcher Architecture

## Overview

CodyWatcher is a local macOS daemon that intercepts Claude Code permission requests, announces them via TTS, captures voice responses via macOS Speech framework, and feeds decisions back to blocked hooks.

## System Architecture

```
┌─────────────┐     POST /notify      ┌─────────────┐
│ Claude Code │ ──────────────────► │  Daemon    │
│ Permission │                     │ (Bun HTTP) │
│   Hook     │                     │            │
└─────────────┘                     └─────┬─────┘
                                         │ mkfifo
                                         ▼
                                  ┌─────────────┐
                                  │ Session   │
                                  │ FIFO     │
                                  └─────┬─────┘
                                       │ cat (blocks)
                                       ▼
                                  ┌─────────────┐
                                  │ listen    │
                                  │ -yesno   │
                                  │ (Swift)  │
                                  └─────┬─────┘
                                       │ exit code
                                       ▼
                                  ┌─────────────┐
                                  │ Decision  │
                                  │ JSON     │
                                  └─────┬─────┘
                                       │ write
                                       ▼
                                  ┌─────────────┐
                                  │ FIFO      │
                                  └─────┬─────┘
                                       │ unblocks
                                       ▼
                                  ┌─────────────┐
                                  │ hook.sh   │
                                  │ returns  │
                                  │ decision │
                                  └─────────────┘
```

## Components

| Component | File | Responsibility |
|-----------|------|---------------|
| Daemon | `daemon.ts` | HTTP server, session management, TTS, voice orchestration |
| Hook | `hook.sh` | Claude Code integration, FIFO read/write |
| Voice Binary | `listen-yesno` | Swift binary for speech recognition |
| Installer | `install.sh` | One-command setup, LaunchAgent registration |

## Key Design Decisions

### FIFO Per Session

Each session gets its own FIFO (`/tmp/codywatcher/sessions/{sessionId}.fifo`). This isolates decisions between concurrent sessions — essential when running 3-4 parallel Claude Code sessions.

### localhost-Only Binding

Daemon binds to `127.0.0.1:18765`. No network exposure — security boundary.

### 30-Second FIFO Timeout

Hook times out after 30s with fallback deny. Prevents permanent block if daemon crashes mid-request.

### Sequential Queue

One voice request at a time — concurrent voice requests would be unintelligible.

### Auth Optional

`CODYWATCHER_KEY` environment variable enables auth. Dev mode (no key) for local development.

## Data Flow

1. **Request Initiation**: Claude Code calls `PermissionRequestHook`
2. **Hook Posts**: `hook.sh` POSTs to daemon's `/notify` endpoint
3. **Daemon Queues**: Stores in session map, creates FIFO
4. **TTS Announces**: Runs `say "Session N requesting to run TOOL"`
5. **Voice Listen**: Spawns `listen-yesno` binary
6. **User Responds**: Speech recognized as "yes" (exit 0) or "no" (exit 1)
7. **Decision Write**: Daemon writes JSON to session FIFO
8. **Hook Reads**: Unblocks, returns decision to Claude Code

## Runtime Dependencies

- **Bun**: HTTP server runtime
- **Swift**: listen-yesno binary, Speech framework
- **say**: macOS TTS
- **jq**: Safe JSON encoding in hook
- **launchd**: Daemon persistence on macOS