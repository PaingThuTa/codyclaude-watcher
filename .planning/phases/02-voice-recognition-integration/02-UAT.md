---
status: testing
phase: 02-voice-recognition-integration
source: 02-01-SUMMARY.md
started: 2026-05-23T00:00:00Z
updated: 2026-05-23T00:00:00Z
---

## Current Test

number: 2
name: Say "yes" to approve
expected: |
  After hearing the announcement, saying "yes" approves the request.
  Look for allow decision in the response.
awaiting: user response

## Tests

### 1. Permission request triggers voice announcement
expected: When a Claude Code permission request triggers the hook, you hear TTS saying the session ID and tool name.
result: pass

### 2. Say "yes" to approve
expected: After hearing the announcement, saying "yes" approves the request and Claude Code continues executing.
result: [pending]

### 3. Say "no" to deny
expected: After hearing the announcement, saying "no" denies the request and Claude Code stops.
result: [pending]

### 4. Silence times out and re-prompts
expected: If you stay silent, after a few seconds you hear "I didn't catch that. Please say yes or no." Then it listens again.
result: [pending]

### 5. Second timeout defaults to deny
expected: If you stay silent again after the re-prompt, the request is denied.
result: [pending]

### 6. Concurrent sessions each get announced
expected: When multiple sessions have permission requests, each one triggers its own announcement with that session's ID.
result: [pending]

### 7. Unauthorized request rejected
expected: A request to the daemon without the correct X-CodyWatcher-Key header returns 401.
result: [pending]

## Summary

total: 7
passed: 1
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

[none yet]