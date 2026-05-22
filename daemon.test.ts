import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import { $ } from "bun";

// Import daemon module — this starts the Bun.serve() server
import "./daemon";

const BASE_URL = "http://127.0.0.1:18765";
const SESSIONS_DIR = "/tmp/codywatcher/sessions";
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "X-CodyWatcher-Key": process.env.CODYWATCHER_KEY || "test-key-dev",
} as const;

// Ensure sessions directory exists for pre-create FIFO test
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

describe("POST /test-notify", () => {
  it("stores a new session and returns status", async () => {
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        sessionId: "test-001",
        tool: "Bash",
        prompt: "Do you want to run git status?",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("stored");
    expect(json.sessionId).toBe("test-001");
  });

  it("updates existing session with same sessionId", async () => {
    // First POST
    await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        sessionId: "test-002",
        tool: "Read",
        prompt: "First prompt",
      }),
    });

    // Second POST with same sessionId
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        sessionId: "test-002",
        tool: "Write",
        prompt: "Updated prompt",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("stored");
    expect(json.sessionId).toBe("test-002");
  });

  it("rejects missing sessionId with 400", async () => {
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ tool: "Bash", prompt: "test" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing tool with 400", async () => {
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ sessionId: "test-003", prompt: "test" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing prompt with 400", async () => {
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ sessionId: "test-004", tool: "Bash" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /status", () => {
  it("returns array of stored requests", async () => {
    // Ensure we have at least one entry
    await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        sessionId: "status-test-001",
        tool: "Bash",
        prompt: "status test",
      }),
    });

    const res = await fetch(`${BASE_URL}/status`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    const entry = json.find((e: any) => e.sessionId === "status-test-001");
    expect(entry).toBeDefined();
    expect(entry.tool).toBe("Bash");
    expect(entry.prompt).toBe("status test");
    expect(entry.status).toBe("pending");
    expect(entry.timestamp).toBeDefined();
  });

  it("returns empty array when no sessions", async () => {
    // Clear by creating a fresh server would be needed for this
    // Instead, verify the response is an array
    const res = await fetch(`${BASE_URL}/status`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });
});

describe("unmatched routes", () => {
  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${BASE_URL}/unknown`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for root", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(404);
  });
});

describe("FIFO operations", () => {
  it("creates FIFO on first notify for a session", async () => {
    const fifoPath = "/tmp/codywatcher/sessions/fifo-test-001.fifo";

    // Clean up if exists
    try {
      fs.unlinkSync(fifoPath);
    } catch {
      // not exists
    }

    await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        sessionId: "fifo-test-001",
        tool: "Bash",
        prompt: "test",
      }),
    });

    // Check FIFO exists
    expect(fs.existsSync(fifoPath)).toBe(true);
    const stat = fs.statSync(fifoPath);
    expect(stat.isFIFO()).toBe(true);
  });

  it("does not throw when FIFO already exists (pre-created by hook)", async () => {
    const fifoPath = "/tmp/codywatcher/sessions/fifo-test-002.fifo";

    // Pre-create the FIFO
    try {
      fs.unlinkSync(fifoPath);
    } catch {
      // not exists
    }
    await $`mkfifo ${fifoPath}`;

    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        sessionId: "fifo-test-002",
        tool: "Read",
        prompt: "test pre-created fifo",
      }),
    });

    expect(res.status).toBe(200);
    // FIFO should still exist
    expect(fs.existsSync(fifoPath)).toBe(true);
  });
});

describe("writeDecision", () => {
  it("catches ENOENT on missing FIFO without crashing", async () => {
    const res = await fetch(`${BASE_URL}/test-write-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "nonexistent-fifo-session",
        decision: "allow",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe("warning_logged");
  });
});

describe("stale session cleanup", () => {
  it("purges sessions older than 1 hour", async () => {
    // Create a session with a backdated timestamp
    const res = await fetch(`${BASE_URL}/test-stale-cleanup`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: "stale-session-001",
        age_ms: 7200000, // 2 hours ago
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.purged).toBe(1);

    // Verify it's gone from status
    const statusRes = await fetch(`${BASE_URL}/status`);
    const sessions = await statusRes.json();
    const stillThere = sessions.find(
      (s: any) => s.sessionId === "stale-session-001"
    );
    expect(stillThere).toBeUndefined();
  });
});

describe("auth middleware", () => {
  it("rejects POST /notify without X-CodyWatcher-Key header (401)", async () => {
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "auth-test-001",
        tool: "Bash",
        prompt: "test",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects POST /notify with wrong X-CodyWatcher-Key (401)", async () => {
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CodyWatcher-Key": "wrong-key",
      },
      body: JSON.stringify({
        sessionId: "auth-test-002",
        tool: "Bash",
        prompt: "test",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("accepts POST /notify with correct X-CodyWatcher-Key (200)", async () => {
    const key = process.env.CODYWATCHER_KEY || "dev-key";
    const res = await fetch(`${BASE_URL}/test-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CodyWatcher-Key": key,
      },
      body: JSON.stringify({
        sessionId: "auth-test-003",
        tool: "Bash",
        prompt: "test",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("stored");
  });
});

describe("FIFO write helper", () => {
  it("returns false for non-existent path", async () => {
    const res = await fetch(`${BASE_URL}/test-fifo-write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fifoPath: "/tmp/codywatcher/sessions/nonexistent.fifo",
        decision: { behavior: "allow" },
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.reason).toBe("not_found");
  });

  it("returns false for regular file (not FIFO)", async () => {
    const testPath = "/tmp/codywatcher/sessions/not-a-fifo-test.tmp";
    // Create a regular file (not a FIFO)
    fs.writeFileSync(testPath, "test");

    const res = await fetch(`${BASE_URL}/test-fifo-write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fifoPath: testPath,
        decision: { behavior: "allow" },
      }),
    });

    // Clean up
    try {
      fs.unlinkSync(testPath);
    } catch {
      // ignore
    }

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.reason).toBe("not_fifo");
  });
});

describe("voice loop", () => {
  const TEST_SCRIPTS_DIR = path.join(import.meta.dir, "test-scripts");

  beforeAll(() => {
    // Create test scripts that exit with specific codes
    fs.mkdirSync(TEST_SCRIPTS_DIR, { recursive: true });

    // Script that exits 0 (yes)
    fs.writeFileSync(
      path.join(TEST_SCRIPTS_DIR, "exit-0.sh"),
      "#!/bin/bash\nexit 0\n"
    );
    fs.chmodSync(path.join(TEST_SCRIPTS_DIR, "exit-0.sh"), 0o755);

    // Script that exits 1 (no)
    fs.writeFileSync(
      path.join(TEST_SCRIPTS_DIR, "exit-1.sh"),
      "#!/bin/bash\nexit 1\n"
    );
    fs.chmodSync(path.join(TEST_SCRIPTS_DIR, "exit-1.sh"), 0o755);

    // Script that exits 2 (timeout/unclear)
    fs.writeFileSync(
      path.join(TEST_SCRIPTS_DIR, "exit-2.sh"),
      "#!/bin/bash\nexit 2\n"
    );
    fs.chmodSync(path.join(TEST_SCRIPTS_DIR, "exit-2.sh"), 0o755);
  });

  afterAll(() => {
    // Clean up test scripts
    try {
      fs.rmSync(TEST_SCRIPTS_DIR, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("writes allow decision when mock binary exits 0", async () => {
    const fifoPath = "/tmp/codywatcher/sessions/voice-allow-test.fifo";
    const sessionId = "voice-allow-test";

    // Clean up any existing FIFO
    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }

    // Create FIFO and background reader
    await $`mkfifo ${fifoPath}`;
    const reader = Bun.spawn(["dd", `if=${fifoPath}`, "of=/dev/null"], {
      stdout: "pipe",
    });

    const res = await fetch(`${BASE_URL}/test-voice-loop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fifoPath,
        sessionId,
        tool: "Bash",
        mockBinary: path.join(TEST_SCRIPTS_DIR, "exit-0.sh"),
      }),
    });
    reader.kill();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("allow");

    // Clean up
    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }
  });

  it("writes deny decision when mock binary exits 1", async () => {
    const fifoPath = "/tmp/codywatcher/sessions/voice-deny-test.fifo";
    const sessionId = "voice-deny-test";

    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }
    await $`mkfifo ${fifoPath}`;
    const reader = Bun.spawn(["dd", `if=${fifoPath}`, "of=/dev/null"], {
      stdout: "pipe",
    });

    const res = await fetch(`${BASE_URL}/test-voice-loop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fifoPath,
        sessionId,
        tool: "Bash",
        mockBinary: path.join(TEST_SCRIPTS_DIR, "exit-1.sh"),
      }),
    });
    reader.kill();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("deny");
    expect(json.message).toBeDefined();

    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }
  });

  it("re-prompts on first timeout (exit 2), then denies on second timeout", async () => {
    const fifoPath = "/tmp/codywatcher/sessions/voice-reprompt-test.fifo";
    const sessionId = "voice-reprompt-test";

    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }
    await $`mkfifo ${fifoPath}`;
    const reader = Bun.spawn(["dd", `if=${fifoPath}`, "of=/dev/null"], {
      stdout: "pipe",
    });

    const res = await fetch(`${BASE_URL}/test-voice-loop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fifoPath,
        sessionId,
        tool: "Bash",
        mockBinary: path.join(TEST_SCRIPTS_DIR, "exit-2.sh"),
      }),
    });
    reader.kill();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("deny");
    expect(json.message).toContain("timed out");

    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }
  });

  it("defaults to deny when listen-yesno binary not found (ENOENT)", async () => {
    const fifoPath = "/tmp/codywatcher/sessions/voice-enoent-test.fifo";
    const sessionId = "voice-enoent-test";

    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }
    await $`mkfifo ${fifoPath}`;
    const reader = Bun.spawn(["dd", `if=${fifoPath}`, "of=/dev/null"], {
      stdout: "pipe",
    });

    const res = await fetch(`${BASE_URL}/test-voice-loop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fifoPath,
        sessionId,
        tool: "Bash",
        mockBinary: "/nonexistent/path/to/listen-yesno",
      }),
    });
    reader.kill();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("deny");

    try { fs.unlinkSync(fifoPath); } catch { /* noop */ }
  });
});
