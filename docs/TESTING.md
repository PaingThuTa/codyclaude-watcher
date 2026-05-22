# Testing

## Verification Steps

### 1. Daemon Health

```bash
curl http://localhost:18765/status
# Expected: [] (empty array, no pending sessions)
```

### 2. Smoke Test Hook

```bash
SESSION_ID="test-$(date +%s)"
mkdir -p /tmp/codywatcher/sessions
mkfifo "/tmp/codywatcher/sessions/${SESSION_ID}.fifo"

~/.codywatcher/bin/hook.sh "$SESSION_ID" "Bash" "ls -la?" &
```

Expected: TTS announces "Session test-... requesting to run Bash"

### 3. listen-yesno Binary

```bash
# Test exit codes
.codywatcher/listen-yesno --help 2>/dev/null || true

# Or manually:
.codywatcher/listen-yesno 2>/dev/null
echo "Exit code: $?"
# 0 = yes, 1 = no, 2 = timeout/unclear
```

### 4. Test Scripts

The project includes test helper scripts:

```bash
# Test FIFO decision handling
./test-scripts/exit-0.sh  # Simulates "yes"
./test-scripts/exit-1.sh  # Simulates "no"
./test-scripts/exit-2.sh  # Simulates timeout
```

### 5. Integration Test

Run in live Claude Code:
1. Set `defaultMode: "default"` in settings
2. Ask Claude to run any command
3. Respond via voice
4. Verify decision echoed back

## Debug Endpoints

```bash
# Test stale cleanup
curl -X POST http://localhost:18765/test-stale-cleanup \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"old","age_ms":7200000}'
# → {"purged":1}

# Test FIFO write
FIFO=$(mktemp -u /tmp/codywatcher/sessions/test-XXXX.fifo)
mkfifo "$FIFO"
curl -X POST http://localhost:18765/test-fifo-write \
  -H "Content-Type: application/json" \
  -d "{\"fifoPath\":\"$FIFO\",\"decision\":{\"ok\":true}}" &
cat "$FIFO"
# → {"ok":true}
```

## Manual Verification (Human Required)

- [ ] End-to-end: permission request → TTS → voice → decision
- [ ] Daemon survives crash and restarts cleanly
- [ ] Multiple concurrent sessions don't leak decisions
- [ ] install.sh re-run doesn't break existing setup