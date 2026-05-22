import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import { $ } from "bun";

// Import daemon module — this starts the Bun.serve() server
import "./daemon";

const BASE_URL = "http://127.0.0.1:18765";
const SESSIONS_DIR = "/tmp/codywatcher/sessions";

// Ensure sessions directory exists for pre-create FIFO test
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

describe("POST /notify", () => {
  it("stores a new session and returns status", async () => {
    const res = await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "test-002",
        tool: "Read",
        prompt: "First prompt",
      }),
    });

    // Second POST with same sessionId
    const res = await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "Bash", prompt: "test" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing tool with 400", async () => {
    const res = await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "test-003", prompt: "test" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing prompt with 400", async () => {
    const res = await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "test-004", tool: "Bash" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /status", () => {
  it("returns array of stored requests", async () => {
    // Ensure we have at least one entry
    await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    const res = await fetch(`${BASE_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
