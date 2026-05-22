import { $ } from "bun";
import fs from "fs";
import path from "path";

const PORT = 18765;
const HOST = "127.0.0.1";
const SESSIONS_DIR = "/tmp/codywatcher/sessions";
const STALE_THRESHOLD_MS = 3600000; // 1 hour

// Shared secret for auth — if not set, auth is disabled with a warning
const CODYWATCHER_KEY = process.env.CODYWATCHER_KEY;
if (!CODYWATCHER_KEY) {
  console.warn("CODYWATCHER_KEY not set — auth disabled (development mode)");
}

interface PendingRequest {
  sessionId: string;
  tool: string;
  prompt: string;
  status: "pending" | "approved" | "denied";
  timestamp: number;
}

const sessionMap = new Map<string, PendingRequest>();

function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getFifoPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.fifo`);
}

async function createFifo(sessionId: string): Promise<void> {
  ensureSessionsDir();
  const fifoPath = getFifoPath(sessionId);
  if (!fs.existsSync(fifoPath)) {
    await $`mkfifo ${fifoPath}`;
  }
}

/**
 * Validate the X-CodyWatcher-Key header against the expected key.
 * Returns true if the key matches, false otherwise.
 * If CODYWATCHER_KEY is not set (development mode), always returns true.
 */
function checkAuthHeader(req: Request, expectedKey: string): boolean {
  if (!expectedKey) {
    // Development mode — no key configured
    return true;
  }
  const providedKey = req.headers.get("X-CodyWatcher-Key");
  return providedKey === expectedKey;
}

/**
 * Safely write a decision JSON to a named pipe (FIFO).
 * Checks that the path exists and is a FIFO before writing.
 * Returns true on success, false on failure.
 */
function writeDecisionToFifo(
  fifoPath: string,
  decision: Record<string, unknown>
): { success: boolean; reason?: string } {
  if (!fs.existsSync(fifoPath)) {
    console.warn(`FIFO not found: ${fifoPath} — session may have disconnected`);
    return { success: false, reason: "not_found" };
  }

  const stat = fs.statSync(fifoPath);
  if (!stat.isFIFO()) {
    console.warn(
      `Path is not a FIFO: ${fifoPath} — may be a regular file`
    );
    return { success: false, reason: "not_fifo" };
  }

  try {
    const fd = fs.openSync(fifoPath, "w");
    fs.writeSync(fd, JSON.stringify(decision) + "\n");
    fs.closeSync(fd);
    return { success: true };
  } catch (err: any) {
    console.warn(`FIFO write failed: ${err?.code} ${err?.message}`);
    return { success: false, reason: err?.code ?? "write_error" };
  }
}

function writeDecision(
  sessionId: string,
  decision: "allow" | "denied",
  message?: string
): void {
  const fifoPath = getFifoPath(sessionId);

  const payload: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: decision === "allow" ? "allow" : "deny",
        ...(decision === "denied" && message ? { message } : {}),
      },
    },
  };

  try {
    const fd = fs.openSync(fifoPath, "w");
    fs.writeSync(fd, JSON.stringify(payload));
    fs.closeSync(fd);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      console.warn(`FIFO not found for session ${sessionId}`);
    } else {
      console.warn(`Error writing decision for session ${sessionId}:`, err);
    }
  }
}

function purgeStaleSessions(): number {
  const now = Date.now();
  let purged = 0;

  for (const [sessionId, entry] of sessionMap) {
    if (now - entry.timestamp > STALE_THRESHOLD_MS) {
      sessionMap.delete(sessionId);
      purged++;
    }
  }

  if (purged > 0) {
    console.log(`Purged ${purged} stale session(s)`);
  }

  return purged;
}

function spawnListenYesno(binaryPath: string, timeout = 5): Promise<number> {
  return new Promise((resolve) => {
    try {
      const proc = Bun.spawn([binaryPath, "--timeout", String(timeout)], {
        stdout: "inherit",
        stderr: "inherit",
      });
      proc.exited.then((code) => resolve(code ?? 0));
    } catch {
      resolve(2); // ENOENT → default to deny
    }
  });
}

interface VoiceLoopResult {
  decision: "allow" | "deny";
  message?: string;
}

async function runVoiceLoop(
  fifoPath: string,
  sessionId: string,
  tool: string,
  binaryPath: string
): Promise<VoiceLoopResult> {
  // Step 1 — TTS announcement
  const sayProc = Bun.spawn(
    ["say", "-v", "Samantha", `Session ${sessionId} requesting to run ${tool}`],
    { stdout: "pipe", stderr: "pipe" }
  );
  await sayProc.exited;

  // Step 2 — First voice recognition attempt (5s timeout)
  let exitCode = await spawnListenYesno(binaryPath, 15);

  // Step 3 — Re-prompt if unclear
  if (exitCode === 2) {
    const repromptProc = Bun.spawn(
      ["say", "-v", "Samantha", "I didn't catch that. Please say yes or no."],
      { stdout: "pipe", stderr: "pipe" }
    );
    await repromptProc.exited;
    exitCode = await spawnListenYesno(binaryPath, 15);
  }

  // Step 4 — Map exit code to decision
  let result: VoiceLoopResult;
  if (exitCode === 0) {
    result = { decision: "allow" };
  } else if (exitCode === 1) {
    result = { decision: "deny", message: "Denied by voice" };
  } else {
    result = { decision: "deny", message: "Voice input timed out" };
  }

  // Step 5 — Write decision to FIFO
  const decisionPayload = {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: result.decision,
        ...(result.message ? { message: result.message } : {}),
      },
    },
  };
  writeDecisionToFifo(fifoPath, decisionPayload);

  return result;
}

// Run stale cleanup every 15 minutes
setInterval(purgeStaleSessions, 15 * 60 * 1000);

const server = Bun.serve({
  port: PORT,
  hostname: HOST,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // POST /notify
    if (url.pathname === "/notify" && req.method === "POST") {
      // Auth check
      if (!checkAuthHeader(req, CODYWATCHER_KEY)) {
        return new Response("Unauthorized", { status: 401 });
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const sessionId = body.sessionId as string;
      const tool = body.tool as string;
      const prompt = body.prompt as string;

      if (!sessionId || !tool || !prompt) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: sessionId, tool, prompt",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Create FIFO for new session
      await createFifo(sessionId);

      const entry: PendingRequest = {
        sessionId,
        tool,
        prompt,
        status: "pending",
        timestamp: Date.now(),
      };

      sessionMap.set(sessionId, entry);

      // Fire voice loop in background — don't await so we return 200 immediately
      const fifoPath = getFifoPath(sessionId);
      const binaryPath = path.join(path.dirname(new URL(import.meta.url).pathname), "listen-yesno");
      runVoiceLoop(fifoPath, sessionId, tool, binaryPath).then((result) => {
        const stored = sessionMap.get(sessionId);
        if (stored) {
          stored.status = result.decision === "allow" ? "approved" : "denied";
        }
      }).catch((err) => {
        console.warn(`Voice loop error for session ${sessionId}:`, err);
      });

      return new Response(
        JSON.stringify({ status: "stored", sessionId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // GET /status
    if (url.pathname === "/status" && req.method === "GET") {
      return new Response(
        JSON.stringify(Array.from(sessionMap.values())),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // POST /test-write-decision (test helper)
    if (
      url.pathname === "/test-write-decision" &&
      req.method === "POST"
    ) {
      const body = await req.json();
      const sessionId = body.sessionId as string;
      writeDecision(sessionId, "allow");
      return new Response(
        JSON.stringify({ result: "warning_logged" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // POST /test-voice-loop (test helper for voice loop)
    if (url.pathname === "/test-voice-loop" && req.method === "POST") {
      const body = await req.json();
      const fifoPath = body.fifoPath as string;
      const sessionId = body.sessionId as string;
      const tool = (body.tool as string) || "Bash";
      const binaryPath = body.mockBinary as string;

      const result = await runVoiceLoop(fifoPath, sessionId, tool, binaryPath);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // POST /test-fifo-write (test helper for writeDecisionToFifo)
    if (url.pathname === "/test-fifo-write" && req.method === "POST") {
      const body = await req.json();
      const fifoPath = body.fifoPath as string;
      const decision = body.decision as Record<string, unknown>;
      const result = writeDecisionToFifo(fifoPath, decision);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // POST /test-stale-cleanup (test helper)
    if (
      url.pathname === "/test-stale-cleanup" &&
      req.method === "POST"
    ) {
      const body = await req.json();
      const sessionId = body.sessionId as string;
      const ageMs = (body.age_ms as number) ?? 7200000;

      // Insert a backdated entry
      sessionMap.set(sessionId, {
        sessionId,
        tool: "Test",
        prompt: "stale",
        status: "pending",
        timestamp: Date.now() - ageMs,
      });

      const purged = purgeStaleSessions();
      return new Response(
        JSON.stringify({ purged }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 404 for everything else
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Daemon listening on ${HOST}:${PORT}`);

export { sessionMap, writeDecision, purgeStaleSessions, createFifo, checkAuthHeader, writeDecisionToFifo, runVoiceLoop, spawnListenYesno, server };
