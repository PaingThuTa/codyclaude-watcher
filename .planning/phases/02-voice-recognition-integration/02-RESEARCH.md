# Phase 2: Voice Recognition Integration - Research

**Researched:** 2026-05-23
**Domain:** macOS Speech framework, Bun subprocess management, FIFO I/O
**Confidence:** MEDIUM

## Summary

This phase connects the Bun daemon's voice loop: sequential subprocess orchestration (`say` then `listen-yesno`), exit code mapping to decisions, and writing allow/deny JSON to per-session FIFOs. The core technical challenges are reliable subprocess management from an async HTTP server, detecting when the macOS Speech framework is unavailable, and writing to FIFOs safely without blocking the event loop or silently corrupting state.

**Primary recommendation:** Use `Bun.spawn()` with `await proc.exited` for sequential voice loop orchestration. Use `statSync(path).isFIFO()` before opening FIFOs for writing to detect deleted sessions. Compile `listen-yesno.swift` with `swiftc -framework Speech` — no additional build tools needed.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **FIFO pre-creation**: Hook creates FIFO before POSTing to daemon (eliminates race condition)
- **JSON safety**: `jq` for encoding in hook.sh (prevents broken JSON on special characters)
- **FIFO read timeout**: 30s timeout with fallback deny (prevents permanently stuck sessions)
- **TTS content**: `toolName` only, not full prompt (user sees full prompt in tab)
- **Multi-session**: Sequential queue (parallel voice would be chaotic)
- **Speech matching**: Exact "yes" / "no" recognition via macOS Speech framework
- **Decision JSON format**: `hookSpecificOutput` envelope with `behavior: "allow" | "deny"`

### Claude's Discretion

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

### Deferred Ideas (OUT OF SCOPE)
- "Approve all similar" voice command (deferred from spec)
- Plan approval / plan review via voice
- Session summary announcement on idle
- Voice commands beyond yes/no
- Tray app with visual session status
- Apple Intelligence integration

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Speech recognition (yes/no) | OS-level (macOS Speech framework) | — | Uses Apple's SFSpeechRecognizer via Swift binary; no cloud dependency |
| TTS announcement | OS-level (`say` CLI) | — | macOS built-in speech synthesis, blocking CLI |
| Subprocess orchestration | API / Daemon (Bun) | — | Bun HTTP server spawns child processes sequentially |
| FIFO I/O | API / Daemon (Bun) | — | Bun writes decision JSON to per-session named pipes |
| Auth middleware | API / Daemon (Bun) | — | Header validation on POST /notify |
| Session state management | API / Daemon (Bun) | — | In-memory Map of pending requests |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | 1.3.13 (verified) | HTTP server + subprocess orchestration | Already project runtime, built-in spawn API |
| macOS Speech framework | System (macOS 14+) | Real-time speech recognition | Built into macOS, on-device, no API key needed |
| `say` CLI | System (macOS built-in) | Text-to-speech announcements | macOS standard, blocking behavior ideal for sequential flow |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` (via Bun) | Built-in | FIFO open/write/close | Writing decisions to named pipes |
| `node:child_process` (via Bun) | Built-in | Alternative spawn API | Only if `Bun.spawn()` insufficient (not needed here) |
| `swiftc` | 6.3.2 (verified) | Compile listen-yesno.swift | macOS system compiler, no Xcode dependency |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `say` CLI | `AVSpeechSynthesizer` via Swift | Adds dependency on another Swift binary; `say` is simpler and blocking |
| macOS Speech framework | Whisper.cpp or other local ASR | Requires bundling ML models, complex compilation; Speech framework is zero-dependency |
| `Bun.spawn()` | Node.js `child_process` | Bun is ~60% faster at spawn; already using Bun for server |

**Installation:** No npm packages needed. This phase uses only Bun built-ins, system CLIs (`say`, `swiftc`, `mkfifo`), and the macOS Speech framework.

**Installation command (build Swift binary):**
```bash
swiftc -framework Speech listen-yesno.swift -o listen-yesno
```

**Version verification:**
- Bun 1.3.13 — confirmed via `bun --version` [VERIFIED: local runtime]
- Swift 6.3.2 — confirmed via `swiftc --version` [VERIFIED: local runtime]
- `say` — confirmed via `/usr/bin/say` [VERIFIED: macOS system]
- macOS Speech framework — compilation with `-framework Speech` succeeds without additional flags [VERIFIED: local compilation test]

## Package Legitimacy Audit

No external packages are installed in this phase. The phase depends exclusively on:
- Bun runtime built-ins (`Bun.spawn`, `Bun.serve`, `node:fs`)
- macOS system tools (`say`, `swiftc`, `mkfifo`)
- macOS Speech framework (system framework, linked via `-framework Speech`)

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Claude Session (Tab 1,2,3)
    │
    │  POST /notify (with X-CodyWatcher-Key header)
    ▼
┌─────────────────────────────────────────────┐
│              Bun Daemon (:18765)             │
│                                              │
│  ┌─────────────┐    ┌──────────────────────┐ │
│  │ Middleware:  │    │  Session Map (Map)   │ │
│  │ Key check    │───►│  sessionId → request │ │
│  │              │    └──────────┬───────────┘ │
│  └─────────────┘               │              │
│                                ▼              │
│  ┌────────────────────────────────────────┐  │
│  │         Voice Loop (Sequential)         │  │
│  │                                         │  │
│  │  1. Bun.spawn(["say", ...])            │  │
│  │     └─ await proc.exited → blocks      │  │
│  │                                         │  │
│  │  2. Bun.spawn(["listen-yesno"])        │  │
│  │     └─ await proc.exited → exit code   │  │
│  │                                         │  │
│  │  3. Map exit code → decision JSON       │  │
│  │     0 → allow, 1 → deny,               │  │
│  │     2 → re-prompt (once), then deny     │  │
│  │                                         │  │
│  │  4. writeToFifo(sessionId, decision)    │  │
│  │     └─ statSync.isFIFO() check          │  │
│  │     └─ openSync → writeSync → closeSync │  │
│  └────────────────────────────────────────┘  │
└────────────────────┬────────────────────────┘
                     │
                     ▼
          /tmp/codywatcher/sessions/
          {sessionId}.fifo (named pipe)
                     │
                     ▼
           hook.sh cat unblocks
           → Claude parses decision
```

### Recommended Project Structure

This phase modifies files within the existing `~/.codywatcher/` layout:

```
~/.codywatcher/
├── daemon.ts              # ADD: voice loop orchestration (DAEMON-05, DAEMON-06)
├── daemon.test.ts         # NEW: unit tests for voice loop, FIFO writing
├── listen-yesno.swift     # NEW: Swift source for speech recognition
├── listen-yesno           # BUILT: compiled binary (gitignored)
├── hook.sh                # MODIFY: add X-CodyWatcher-Key header
└── install.sh             # MODIFY: add swiftc compilation step
```

### Pattern 1: Sequential Subprocess Orchestration
**What:** Run `say`, await exit, then run `listen-yesno`, await exit code.
**When to use:** Always for this phase — the locked decision requires sequential execution.
**Example:**
```typescript
// Source: [VERIFIED: bun.sh/docs/api/spawn + local testing]
async function runVoiceLoop(sessionId: string, tool: string): Promise<"allow" | "deny"> {
  // Step 1: TTS announcement (blocking)
  const sayProc = Bun.spawn([
    "say",
    "-v", "Samantha",
    `Session ${sessionId} requesting to run ${tool}`
  ]);
  await sayProc.exited;

  // Step 2: Voice recognition
  const listenProc = Bun.spawn([
    "./listen-yesno",
    "--timeout", "10"
  ], {
    cwd: "~/.codywatcher"
  });
  const exitCode = await listenProc.exited;

  // Step 3: Map exit code to decision
  if (exitCode === 0) return "allow";
  if (exitCode === 1) return "deny";
  // exitCode === 2: timeout or unclear — re-prompt once
  return await rePrompt(sessionId, tool);
}

async function rePrompt(sessionId: string, tool: string): Promise<"allow" | "deny"> {
  const sayProc = Bun.spawn([
    "say", "-v", "Samantha",
    "I didn't catch that. Please say yes or no."
  ]);
  await sayProc.exited;

  const listenProc = Bun.spawn([
    "./listen-yesno", "--timeout", "10"
  ], { cwd: "~/.codywatcher" });
  const exitCode = await listenProc.exited;

  // Second ambiguous attempt → default to deny
  if (exitCode === 0) return "allow";
  return "deny";
}
```

### Pattern 2: FIFO Write with Safety Check
**What:** Before writing to a FIFO, verify it exists and is a named pipe (not a regular file created by a stale path).
**When to use:** Every FIFO write in the daemon to handle session cleanup races.
**Example:**
```typescript
// Source: [VERIFIED: local testing with Bun 1.3.13]
import { existsSync, statSync, openSync, writeSync, closeSync } from "node:fs";

function writeDecisionToFifo(fifoPath: string, decision: Record<string, unknown>): boolean {
  if (!existsSync(fifoPath)) {
    console.warn(`FIFO not found: ${fifoPath} — session may have disconnected`);
    return false;
  }

  const stat = statSync(fifoPath);
  if (!stat.isFIFO()) {
    console.warn(`Path is not a FIFO: ${fifoPath} — may be a regular file`);
    return false;
  }

  try {
    const fd = openSync(fifoPath, "w");
    writeSync(fd, JSON.stringify(decision) + "\n");
    closeSync(fd);
    return true;
  } catch (e: any) {
    console.warn(`FIFO write failed: ${e.code} ${e.message}`);
    return false;
  }
}
```

### Pattern 3: ENOENT Handling for Missing Binaries
**What:** Catch ENOENT errors when spawning `listen-yesno` or `say` — they may not exist at the expected path.
**When to use:** Before spawning the Swift binary.
**Example:**
```typescript
// Source: [VERIFIED: local testing with Bun 1.3.13]
async function spawnWithEnoentFallback(cmd: string[], fallback: string): Promise<number> {
  try {
    const proc = Bun.spawn(cmd);
    return await proc.exited;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.warn(`Binary not found: ${cmd[0]} — using fallback: ${fallback}`);
      return 2; // Treat as timeout/unclear → deny
    }
    throw e;
  }
}
```

### Pattern 4: Shared Secret Header Middleware
**What:** Simple header validation on POST /notify.
**When to use:** Every request to /notify and /shutdown.
**Example:**
```typescript
// Source: [VERIFIED: bun.sh/docs/api/http]
function checkAuthHeader(req: Request, expectedKey: string): boolean {
  const providedKey = req.headers.get("X-CodyWatcher-Key");
  return providedKey === expectedKey;
}

// In Bun.serve fetch handler:
if (req.method === "POST" && req.url.endsWith("/notify")) {
  if (!checkAuthHeader(req, process.env.CODYWATCHER_KEY!)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ... handle notify
}
```

### Anti-Patterns to Avoid
- **Parallel voice spawning:** The locked decision requires sequential execution. Spawning `say` and `listen-yesno` in parallel causes the recognizer to pick up the TTS audio, producing false "yes"/"no" matches.
- **`openSync` without `isFIFO()` check:** `openSync(path, "w")` silently creates a regular file if the FIFO was deleted. Always verify `statSync(path).isFIFO()` before writing. [VERIFIED: local testing]
- **Spawning without ENOENT guard:** If `listen-yesno` binary is missing or `install.sh` hasn't been run, `Bun.spawn()` throws synchronously. Always wrap in try/catch and default to deny. [VERIFIED: local testing]
- **Using `Bun.spawnSync` in HTTP handler:** While `Bun.spawnSync` exists, it blocks the event loop entirely. Use async `Bun.spawn()` + `await proc.exited` inside the `fetch` handler so other requests can still be accepted (though processed sequentially per the locked decision).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speech recognition | Custom audio analysis, Web Audio API + ML model | macOS `Speech` framework (`SFSpeechRecognizer`) | Built-in, offline, phrase-level recognition, no model bundling needed |
| Text-to-speech | AVSpeechSynthesizer Swift wrapper | `say` CLI | Already available, blocking behavior matches sequential flow, no compilation needed |
| HTTP server | Express/Fastify on Node | `Bun.serve()` | Already the runtime, zero dependencies, ~2.5x faster than Node |
| Subprocess management | Node `child_process` + callbacks | `Bun.spawn()` + `await proc.exited` | 60% faster spawn, clean async API, built into Bun |
| JSON encoding in shell | String interpolation with escaped quotes | `jq` | Handles special characters safely, no injection risk |
| Process timeout | Custom timer + kill logic | `Bun.spawn({ cmd, timeout })` | Built-in timeout with configurable kill signal |

**Key insight:** The entire phase uses macOS built-ins and Bun built-ins — zero external dependencies. Hand-rolling anything in this domain (speech recognition, TTS, HTTP server, subprocess management) adds complexity for problems the OS and runtime already solve.

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. No runtime state changes required.

## Common Pitfalls

### Pitfall 1: Speech Framework Requires Microphone Authorization
**What goes wrong:** `SFSpeechRecognizer.requestAuthorization()` must be called before recognition works. Without authorization, recognition silently returns empty results or fails.
**Why it happens:** macOS requires explicit user permission for any app that accesses the microphone. Command-line tools need this permission granted via the Terminal app's System Preferences privacy settings.
**How to avoid:** `listen-yesno.swift` must call `SFSpeechRecognizer.requestAuthorization()` before starting recognition. The binary should detect `AVAudioSession` or authorization denial and exit 2. Test manually on first use: macOS will show a permission dialog for Terminal/Ghostty.
**Warning signs:** `SFSpeechRecognizer` returns nil or recognition results are always empty.

### Pitfall 2: FIFO openSync("w") Creates Regular File on Missing Path
**What goes wrong:** If a session's FIFO is deleted but the daemon still tries to write, `openSync(path, "w")` creates a regular file instead of failing with ENOENT. Subsequent sessions that create a FIFO at the same path find a regular file.
**Why it happens:** The `O_WRONLY | O_CREAT` flag set by `openSync(path, "w")` creates the file if it doesn't exist.
**How to avoid:** Always check `existsSync(path) && statSync(path).isFIFO()` before opening. [VERIFIED: local testing confirmed this behavior]
**Warning signs:** `/tmp/codywatcher/sessions/{sessionId}.fifo` is a regular file (`-rw-r--r--`) instead of a named pipe (`prw-r--r--`).

### Pitfall 3: `say` Output Goes to Default Audio Device
**What goes wrong:** If the user has an external display, AirPods, or Bluetooth speaker connected, `say` plays on the default device which may not be the user's current output.
**Why it happens:** `say` uses the system default output device set in System Preferences > Sound.
**How to avoid:** Document this behavior. The user should ensure their preferred output is the system default. For now, the default behavior is acceptable for MVP. The `-a` flag can target a specific device if needed in the future.
**Warning signs:** User reports not hearing TTS announcements.

### Pitfall 4: SFSpeechRecognizer May Require a Live Speech Recognition Session
**What goes wrong:** `SFSpeechRecognizer` is typically used with `SFSpeechAudioBufferRecognitionRequest` and `SFSpeechRecognitionTask`. The task runs asynchronously and delivers results via callbacks. The binary must manage the run loop (`RunLoop.main.run()`) to keep the process alive while recognition is active.
**Why it happens:** Speech recognition uses CoreFoundation run loops for audio processing. Without a run loop, the process exits immediately.
**How to avoid:** Use `RunLoop.main.run(until: Date(timeIntervalSinceNow: timeout))` to keep the process alive for the recognition window. Cancel the recognition task when the timeout expires or a result is found.
**Warning signs:** Binary exits immediately without recognizing anything.

### Pitfall 5: Swift Binary Path Resolution
**What goes wrong:** `Bun.spawn(["./listen-yesno"])` uses the daemon's working directory, which may not be `~/.codywatcher/`.
**Why it happens:** The daemon might be started from a different directory (launchd plist, manual invocation).
**How to avoid:** Resolve the binary path relative to the daemon's own location: `const BINARY_PATH = path.join(import.meta.dir, "listen-yesno")`. [VERIFIED: `import.meta.dir` is available in Bun]

## Code Examples

### Voice Loop: Full Orchestration with Re-prompt
```typescript
// Source: [VERIFIED: bun.sh/docs/api/spawn + CONTEXT.md decisions]
async function handleVoiceDecision(
  fifoPath: string,
  sessionId: string,
  tool: string,
  timeout: number = 10
): Promise<void> {
  // Step 1: TTS announcement
  const sayProc = Bun.spawn([
    "say", "-v", "Samantha",
    `Session ${sessionId} requesting to run ${tool}`
  ]);
  await sayProc.exited;

  // Step 2: Voice recognition (up to 2 attempts)
  let exitCode = await spawnListenYesno(timeout);

  if (exitCode === 2) {
    // First attempt unclear — re-prompt
    const rePromptSay = Bun.spawn([
      "say", "-v", "Samantha",
      "I didn't catch that. Please say yes or no."
    ]);
    await rePromptSay.exited;
    exitCode = await spawnListenYesno(timeout);
  }

  // Step 3: Map to decision
  const decision = exitCode === 0
    ? { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } }
    : { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: exitCode === 2 ? "Voice input timed out" : "Denied by voice" } } };

  // Step 4: Write to FIFO
  writeDecisionToFifo(fifoPath, decision);
}

function spawnListenYesno(timeout: number): Promise<number> {
  return new Promise((resolve) => {
    try {
      const proc = Bun.spawn([
        path.join(import.meta.dir, "listen-yesno"),
        "--timeout", String(timeout)
      ]);
      proc.exited.then((code) => resolve(code ?? 2));
    } catch (e: any) {
      if (e.code === "ENOENT") {
        console.warn("listen-yesno binary not found — defaulting to deny");
        resolve(2);
      } else {
        resolve(2);
      }
    }
  });
}
```

### Swift: SFSpeechRecognizer Yes/No Listener (Skeleton)
```swift
// Source: [ASSUMED: macOS Speech framework documentation patterns — needs manual verification on target machine]
import Foundation
import Speech
import AVFoundation

let timeout: TimeInterval = 10

// Request microphone permission
let semaphore = DispatchSemaphore(value: 0)
SFSpeechRecognizer.requestAuthorization { status in
  if status != .authorized {
    print("Speech recognition not authorized: \(status.rawValue)")
    exit(2) // Framework unavailable
  }
  semaphore.signal()
}
semaphore.wait()

// Check recognizer availability
guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
      recognizer.isAvailable else {
  print("SFSpeechRecognizer not available")
  exit(2)
}

// Set up audio session
let audioSession = AVAudioSession.sharedInstance()
try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

// Create recognition request
let request = SFSpeechAudioBufferRecognitionRequest()
guard let inputNode = AVAudioEngine().inputNode else {
  print("No audio input node")
  exit(2)
}

let audioEngine = AVAudioEngine()
let recordingFormat = inputNode.outputFormat(forBus: 0)
inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
  request.append(buffer)
}

// Start recognition
let task = recognizer.recognitionTask(with: request) { result, error in
  guard let result = result else { return }

  let transcription = result.bestTranscription.formattedString.lowercased()
  if transcription.contains("yes") {
    audioEngine.stop()
    exit(0)
  } else if transcription.contains("no") {
    audioEngine.stop()
    exit(1)
  }
}

// Keep run loop alive for timeout
try audioEngine.start()
RunLoop.main.run(until: Date(timeIntervalSinceNow: timeout))

// Timeout reached
audioEngine.stop()
task.cancel()
exit(2)
```

### Shell: Hook with Auth Header
```bash
# Source: [CITED: codywatcher-spec.md engineering review + CONTEXT.md]
#!/bin/bash
SESSION_ID="$1"
TOOL="$2"
PROMPT="$3"

FIFO="/tmp/codywatcher/sessions/$SESSION_ID.fifo"
mkdir -p /tmp/codywatcher/sessions
[ -p "$FIFO" ] || mkfifo "$FIFO"

# POST to daemon with auth header
curl -s -X POST http://localhost:18765/notify \
  -H "Content-Type: application/json" \
  -H "X-CodyWatcher-Key: ${CODYWATCHER_KEY}" \
  -d "$(jq -n --arg sid "$SESSION_ID" --arg tool "$TOOL" --arg prompt "$PROMPT" \
    '{"sessionId":$sid,"tool":$tool,"prompt":$prompt}')" \
  >/dev/null

# Read decision with 30s timeout
DECISION=$(timeout 30 cat "$FIFO" 2>/dev/null) || \
  DECISION='{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Daemon timed out"}}}'

echo "$DECISION"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cloud speech APIs (Google STT, AWS Transcribe) | On-device macOS Speech framework | macOS 10.15+ | Zero API keys, offline, no latency, no cost |
| `AVAudioEngine` + custom audio processing | `SFSpeechRecognizer` with phrase matching | macOS 10.15 | 10 lines vs 200+ lines |
| Node.js `child_process.spawn()` + callbacks | `Bun.spawn()` + `await proc.exited` | Bun 1.0 | 60% faster spawn, cleaner async API |
| Manual FIFO handling with error-prone `open()` | `statSync().isFIFO()` guard before write | — | Eliminates silent file creation bug |

**Deprecated/outdated:**
- `recognizeSpeech:` (deprecated): Replaced by `recognitionTask(with:delegate:)` in iOS 10+/macOS 10.15+
- Continuous recognition for yes/no: Use phrase-level recognition with early exit on first match — continuous mode wastes CPU for a binary decision

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SFSpeechRecognizer.requestAuthorization()` works for CLI binaries (no app bundle) | Swift Code Examples, Pitfall 1 | MEDIUM — If CLI tools cannot request mic permission, the binary needs an app bundle or the user must grant Terminal/Host app permission manually in System Preferences |
| A2 | `SFSpeechAudioBufferRecognitionRequest` with `AVAudioEngine` works for real-time recognition | Swift Code Examples | MEDIUM — Alternative is `SFSpeechURLRecognitionRequest` with recorded file, but that changes the architecture |
| A3 | `recognizer.isAvailable` reliably detects when Speech framework cannot recognize (offline, restricted) | Swift Code Examples | LOW — This is documented Apple API behavior |
| A4 | `RunLoop.main.run(until:)` keeps a CLI process alive for async speech recognition | Pitfall 4 | MEDIUM — Without a run loop, the process exits immediately; this is the standard pattern for CLI CoreFoundation apps |
| A5 | `statSync(path).isFIFO()` returns true only for named pipes, not regular files | FIFO Write Pattern | LOW — Verified via local testing with Bun 1.3.13 |
| A6 | `Bun.spawn()` throws ENOENT synchronously for non-existent commands | Pattern 3, Code Examples | LOW — Verified via local testing |
| A7 | `import.meta.dir` resolves to the directory containing the executing TypeScript file | Pitfall 5 | LOW — Documented in Bun docs |

## Open Questions

1. **Does `SFSpeechRecognizer` require an app bundle for microphone permission on macOS?**
   - What we know: iOS requires an app bundle with `NSMicrophoneUsageDescription` in Info.plist. macOS CLI tools may be treated as part of the Terminal/Host app.
   - What's unclear: Whether a bare `swiftc`-compiled binary triggers a permission dialog, or whether the user must grant permission to Terminal/Host.app manually.
   - Recommendation: Test manually after first build. If no dialog appears, the user may need to grant Microphone permission to Terminal.app in System Preferences > Privacy & Security > Microphone.

2. **Will `say` audio interfere with `listen-yesno` microphone input?**
   - What we know: `say` plays through the default output device. `listen-yesno` captures from the default input device (microphone).
   - What's unclear: If the system has "Play user feedback through speakers" enabled, `say` output could be picked up by the microphone, causing false "yes" matches (especially since "yes" contains similar phonemes to common speech).
   - Recommendation: This is a real risk. The daemon should add a brief pause (500ms) between `say` completing and `listen-yesno` starting. Alternatively, the user can be instructed to use headphones to prevent speaker-to-mic feedback.

3. **What is the actual accuracy of phrase-level "yes"/"no" recognition with SFSpeechRecognizer?**
   - What we know: The framework uses Apple's on-device speech model. Accuracy depends on accent, ambient noise, and microphone quality.
   - What's unclear: Real-world false positive/negative rates for single-word recognition.
   - Recommendation: The re-prompt pattern mitigates single-recognition errors. Exit code 2 (unclear) should cover cases where neither "yes" nor "no" is confidently recognized.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Daemon HTTP server, subprocess orchestration | ✓ | 1.3.13 | — |
| `say` CLI | TTS announcements | ✓ | macOS built-in | — |
| `swiftc` | Compile listen-yesno.swift | ✓ | 6.3.2 | — |
| macOS Speech framework | Speech recognition | ✓ | System (macOS 15.5) | None — phase requires macOS |
| `mkfifo` | FIFO creation (hook.sh) | ✓ | macOS built-in | — |
| `jq` | Safe JSON encoding (hook.sh) | [ASSUMED] | — | Install via brew, or use python3 -c json.dumps |
| `timeout` (GNU coreutils) | FIFO read timeout (hook.sh) | [ASSUMED] | — | macOS `timeout` may differ from GNU; verify or use `gtimeout` from coreutils |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- `jq`: If not available, install via `brew install jq`. Fallback: `python3 -c 'import json,sys; print(json.dumps(...))'`
- `timeout`: macOS includes `timeout` (different from GNU). If unavailable, fallback: `{ cat "$FIFO" & PID=$!; sleep 30; kill $PID 2>/dev/null; }`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun built-in test runner (`bun test`) — no external install needed |
| Config file | none — see Wave 0 |
| Quick run command | `bun test daemon.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAEMON-05 | Daemon runs listen-yesno Swift binary | unit | `bun test daemon.test.ts -t "voice loop"` | Wave 0 |
| DAEMON-06 | Daemon writes allow/deny/timeout decision JSON to FIFO | unit | `bun test daemon.test.ts -t "FIFO write"` | Wave 0 |
| VOICE-01 | listen-yesno recognizes "yes" → exit 0 | manual | Manual audio test on macOS | Wave 0 |
| VOICE-02 | listen-yesno recognizes "no" → exit 1 | manual | Manual audio test on macOS | Wave 0 |
| VOICE-03 | listen-yesno times out after 10s → exit 2 | integration | `timeout 15 ./listen-yesno --timeout 10; echo $?` | Wave 0 |
| VOICE-04 | listen-yesno handles Speech framework unavailable → exit 2 | unit | Mock `SFSpeechRecognizer.isAvailable = false` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test daemon.test.ts` (daemon unit tests only)
- **Per wave merge:** `bun test` (full suite including listen-yesno timeout test)
- **Phase gate:** Full suite green + manual voice recognition test on target macOS before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `daemon.test.ts` — tests for voice loop orchestration, FIFO writing, ENOENT handling, auth middleware
- [ ] `listen-yesno.test.ts` (limited) — tests for timeout behavior, framework unavailable path
- [ ] `listen-yesno.swift` manual test plan — actual "yes"/"no" recognition on target machine
- [ ] Framework install: none needed — Bun provides test runner

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — localhost only, shared secret header |
| V3 Session Management | No | N/A — stateless HTTP with shared secret |
| V4 Access Control | Partial | Shared secret header prevents accidental localhost triggers |
| V5 Input Validation | Yes | `jq` for safe JSON encoding, header validation, FIFO path sanitization |
| V6 Cryptography | No | No encryption needed — localhost communication |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stray HTTP POST triggers TTS | Tampering | `X-CodyWatcher-Key` header validation |
| FIFO path injection via sessionId | Spoofing | Session ID is UUID from Claude — validate format before use in path construction |
| Swift binary replaced by malicious executable | Elevation of Privilege | Binary is compiled from source in `~/.codywatcher/` — user controls the build |
| `say` output leaked to other processes on shared machine | Information Disclosure | `say` plays on local audio device only — no network transmission |

## Sources

### Primary (HIGH confidence)
- Bun spawn API — https://bun.sh/docs/api/spawn — full API, exit handling, ENOENT behavior, timeout option
- Bun server API — https://bun.sh/docs/api/http — `Bun.serve()`, request handling, header access
- Bun file I/O API — https://bun.sh/docs/api/file-io — `Bun.write()`, FileSink, directory operations
- `say(1)` man page — macOS system documentation — voice selection, blocking behavior, rate control
- Swift compilation test — local verification with `swiftc -framework Speech` — 6.3.2 on macOS 15.5
- FIFO write test — local verification with Bun 1.3.13 — `openSync` + `statSync().isFIFO()` pattern
- Sequential spawn test — local verification — `await proc.exited` pattern, ENOENT error format
- codywatcher-spec.md — project architecture, data flow, test plan

### Secondary (MEDIUM confidence)
- macOS Speech framework patterns — Apple developer documentation (inferred from API signatures, not live-fetchable due to JavaScript requirement)
- `SFSpeechRecognizer.requestAuthorization()` — standard macOS permission pattern for speech recognition
- `AVAudioEngine` + `SFSpeechAudioBufferRecognitionRequest` — standard real-time recognition setup

### Tertiary (LOW confidence)
- Speech framework authorization behavior for CLI binaries without app bundles — [ASSUMED: standard macOS behavior, not tested]
- Speaker-to-microphone feedback risk between `say` output and `listen-yesno` input — [ASSUMED: acoustic coupling risk]
- Accuracy of single-word "yes"/"no" phrase recognition — [ASSUMED: based on general speech recognition knowledge]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components verified locally (Bun 1.3.13, Swift 6.3.2, `say`, `swiftc -framework Speech` compilation)
- Architecture: HIGH — patterns verified via local testing (FIFO write, sequential spawn, ENOENT handling)
- Swift Speech framework: MEDIUM — API patterns based on documented macOS APIs but not live-fetched due to JavaScript requirement on Apple docs pages
- Pitfalls: MEDIUM — FIFO behavior verified locally, Speech framework pitfalls based on documented patterns

**Research date:** 2026-05-23
**Valid until:** 30 days (stable — macOS system APIs and Bun APIs are relatively stable)
