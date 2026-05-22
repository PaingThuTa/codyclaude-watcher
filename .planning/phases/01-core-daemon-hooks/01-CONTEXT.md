# Phase 1: Core Daemon & Hooks - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Working daemon + hook integration that routes permission requests through localhost. Full HTTP/FIFO plumbing must work — no voice yet. The daemon accepts POST /notify, stores requests, writes decisions to FIFO. Hook script POSTs to daemon, blocks on FIFO, echoes decision to stdout. End-to-end: notify → daemon stores → FIFO write → hook unblocks. GET /status returns active pending requests. Daemon gracefully handles missing FIFO and stale session cleanup. No breakage when daemon not running — hook falls through to normal Claude behavior.

</domain>

<decisions>
## Implementation Decisions

### Daemon Structure
- **D-01:** Single `daemon.ts` file — all logic in one place. Route handling, session map, FIFO lifecycle all in one file. Simple and maintainable for this small daemon.

### Session & FIFO Lifecycle
- **D-02:** Minimal session state — track only sessionId, tool name, prompt, status (pending/approved/denied), and timestamp.
- **D-03:** FIFO is per-session, reused across multiple requests in the same session. Hook pre-creates the FIFO before POSTing to daemon. Daemon opens it for writing to send decisions. SessionEndHook cleans up the FIFO file.
- **D-04:** Stale session map entries purged after 1 hour (DAEMON-08).

### Hook Fallback Behavior
- **D-05:** Hook detects daemon is down via curl connection timeout (short timeout, ~2s). When daemon not running, hook produces no output — Claude Code falls back to normal permission prompt. No breakage.

### Status Endpoint
- **D-06:** GET /status returns JSON array of pending requests: `[{ "sessionId": "abc", "tool": "Bash", "prompt": "...", "status": "pending", "timestamp": 1234567890 }]`. Easy to parse for debugging and future tooling.

### Previously Decided (from PROJECT.md)
- **D-07:** FIFO pre-created in hook.sh, not daemon — eliminates race condition
- **D-08:** jq for JSON encoding in hook — safe handling of special characters in prompts
- **D-09:** 30-second timeout on FIFO read — prevents permanently stuck sessions
- **D-10:** toolName-only TTS prompts — full prompt is noise for TTS, user sees it in tab
- **D-11:** Sequential queue for simultaneous requests — parallel voice would be chaotic
- **D-12:** Hook silences curl output, echoes only FIFO decision to stdout

### Claude's Discretion
- Error response format for failed POST /notify requests
- Exact port binding verification strategy
- Session map data structure implementation details (Map vs plain object)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Goal & Requirements
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, requirement IDs
- `.planning/REQUIREMENTS.md` — All v1 requirements (DAEMON-01 through SEC-03)
- `.planning/PROJECT.md` — Key decisions, constraints, context

### Project Spec
- `codywatcher-spec.md` — Complete architecture spec with data flow, error handling, file structure, test plan

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No existing source code — greenfield project. Only `.planning/` directory and spec document exist.

### Established Patterns
- None yet — this is the first phase. Patterns established here will be followed by Phase 2 and 3.

### Integration Points
- Claude Code hooks (PermissionRequestHook, SessionStartHook, SessionEndHook) configured via `~/.cody-claude/settings.json`
- macOS `say` command for TTS (Phase 1 plumbing, voice recognition deferred to Phase 2)
- FIFO files in `/tmp/codywatcher/sessions/`

</code_context>

<specifics>
## Specific Ideas

- Daemon listens on `localhost:18765` (from spec)
- Decision JSON written to FIFO must match Claude's expected PermissionRequestHook format: `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}` for allow, `{"behavior":"deny","message":"..."}` for deny
- Hook uses `jq` to safely encode JSON with special characters
- Hook includes 30-second timeout on FIFO read with fallback deny
- Session IDs are UUIDs provided by Claude Code

</specifics>

<deferred>
## Deferred Ideas

- Shared secret for /notify endpoint (SEC-04 optional) — low risk for localhost-only, can be added later
- "Approve all similar" voice command — Phase 2
- Plan approval via voice — Phase 2
- Session summary announcement — Phase 2
- Tray app with visual session status — Phase 2
- Apple Intelligence integration — Phase 2

</deferred>

---

*Phase: 01-core-daemon-hooks*
*Context gathered: 2026-05-23*
