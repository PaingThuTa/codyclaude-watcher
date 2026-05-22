# 02-CONTEXT.md — Voice Recognition Integration

**Phase:** 02 — Voice Recognition Integration
**Date:** 2026-05-23
**Status:** Decisions captured, ready for planning

## Domain

The voice loop — macOS TTS announcements + Swift speech recognition + daemon writes decisions to FIFO based on voice input.

## Prior Decisions (carried from spec)

These were resolved in the engineering review and are NOT re-asked:

- **FIFO pre-creation**: Hook creates FIFO before POSTing to daemon (eliminates race condition)
- **JSON safety**: `jq` for encoding in hook.sh (prevents broken JSON on special characters)
- **FIFO read timeout**: 30s timeout with fallback deny (prevents permanently stuck sessions)
- **TTS content**: `toolName` only, not full prompt (user sees full prompt in tab)
- **Multi-session**: Sequential queue (parallel voice would be chaotic)
- **Speech matching**: Exact "yes" / "no" recognition via macOS Speech framework
- **Decision JSON format**: `hookSpecificOutput` envelope with `behavior: "allow" | "deny"`

## Decisions

### Voice Ambiguity Handling

- **Decision**: Re-prompt on ambiguous recognition (re-run listen-yesno), do NOT default to deny
- **Rationale**: Defaulting to deny forces the user to click manually, breaking the whole value proposition. A second listen-yesno cycle keeps the user in the voice loop.
- **Implementation note**: The daemon should run a second `listen-yesno` with the same timeout. If the second attempt is also ambiguous/unclear, then default to deny — this prevents infinite re-prompt loops.

### Daemon Voice Loop Orchestration

- **Decision**: Sequential spawn + await two subprocesses
- **Rationale**: Spawn `say`, wait for exit, then spawn `listen-yesno`, wait for exit code. Simple, correct, refactorable later to a queue worker if needed.
- **Flow**: `say "Session {id} requesting to run {tool}"` → await exit → `./listen-yesno --timeout 10` → await exit → map exit code (0=allow, 1=deny, 2=timeout/re-prompt) → write decision JSON to FIFO

### Security — Shared Secret Header

- **Decision**: Add `X-CodyWatcher-Key` header check
- **Rationale**: Prevents accidental TTS triggers from stray HTTP clients on localhost. Low risk but trivial to add.
- **Implementation**:
  - Hook.sh: `curl -H "X-CodyWatcher-Key: ${CODYWATCHER_KEY}" ...`
  - Daemon.ts: Reject POST /notify if header doesn't match
  - Key stored in `~/.codywatcher/.env` or passed as environment variable

## Canonical Refs

- `codywatcher-spec.md` — Full architecture, data flow, error handling, test plan
- `.planning/ROADMAP.md` — Phase 2 success criteria and requirements mapping
- `.planning/REQUIREMENTS.md` — DAEMON-05, DAEMON-06, VOICE-01 through VOICE-04

## Deferred Ideas

- "Approve all similar" voice command (deferred from spec)
- Plan approval / plan review via voice
- Session summary announcement on idle
- Voice commands beyond yes/no
- Tray app with visual session status
- Apple Intelligence integration
