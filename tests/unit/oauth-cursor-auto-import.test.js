import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fsPromises from "fs/promises";
import * as childProcess from "child_process";

// Shared mock db instance — must be hoisted so the vi.mock factory (also hoisted)
// captures the same object the tests mutate.
const h = vi.hoisted(() => ({
  mockDbInstance: {
    prepare: vi.fn(),
    close: vi.fn(),
    __throwOnConstruct: false,
  },
}));

// Mock next/server
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    })),
  },
}));

// Mock os
vi.mock("os", () => ({
  default: { homedir: vi.fn(() => "/mock/home") },
  homedir: vi.fn(() => "/mock/home"),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  access: vi.fn(),
  constants: { R_OK: 4 },
}));

// Mock child_process (sqlite3 CLI fallback + linux `which` check)
vi.mock("child_process", () => {
  const execFile = vi.fn((cmd, args, opts, cb) => {
    const err = new Error("sqlite3: command not found");
    err.code = "ENOENT";
    cb(err);
  });
  return {
    default: { execFile },
    execFile,
    promisify: (fn) => fn,
  };
});

// Mock better-sqlite3 as a class so `new Database(...)` works
vi.mock("better-sqlite3", () => ({
  default: class MockDatabase {
    constructor() {
      if (h.mockDbInstance.__throwOnConstruct) {
        throw new Error("SQLITE_CANTOPEN");
      }
      return h.mockDbInstance;
    }
  },
}));

const mockDbInstance = h.mockDbInstance;

// We need to dynamically import after mocks are registered
let GET;

describe("GET /api/oauth/cursor/auto-import", () => {
  const originalPlatform = process.platform;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbInstance.__throwOnConstruct = false;
    // Force darwin so macOS-specific logic is exercised
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });
    // Re-import to pick up fresh mocks each run
    const mod = await import("../../src/app/api/oauth/cursor/auto-import/route.js");
    GET = mod.GET;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  // ── macOS path probing ────────────────────────────────────────────────

  it("returns not-found when no macOS cursor db paths are accessible", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain("Cursor database not found. Checked locations:");
  });

  it("falls back to the manual-paste response when db exists but cannot be opened", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    mockDbInstance.__throwOnConstruct = true;

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.windowsManual).toBe(true);
  });

  // ── Token extraction ──────────────────────────────────────────────────

  it("extracts tokens using exact keys", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    const get = vi.fn((key) => {
      const rows = {
        "cursorAuth/accessToken": { value: "test-token" },
        "cursorAuth/token": { value: "test-token" },
        "storage.serviceMachineId": { value: "test-machine-id" },
        "storage.machineId": { value: "test-machine-id" },
        "telemetry.machineId": { value: "test-machine-id" },
      };
      return rows[key] || undefined;
    });
    mockDbInstance.prepare.mockReturnValue({ get });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("test-token");
    expect(response.body.machineId).toBe("test-machine-id");
    expect(mockDbInstance.close).toHaveBeenCalled();
  });

  it("unwraps JSON-encoded string values", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    const get = vi.fn((key) => {
      const rows = {
        "cursorAuth/accessToken": { value: '"json-token"' },
        "storage.serviceMachineId": { value: '"json-machine-id"' },
      };
      return rows[key] || undefined;
    });
    mockDbInstance.prepare.mockReturnValue({ get });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("json-token");
    expect(response.body.machineId).toBe("json-machine-id");
  });

  it("returns manual-paste response when tokens are missing", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue();
    mockDbInstance.prepare.mockReturnValue({ get: vi.fn(() => undefined) });

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.windowsManual).toBe(true);
  });

  // ── linux/win32 keep original behavior ────────────────────────────────

  it("linux probes config paths and skips when not installed", async () => {
    Object.defineProperty(process, "platform", { value: "linux", writable: true });
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain("Cursor database not found. Checked locations:");
  });

  it("unsupported platform still probes default paths (no 400)", async () => {
    Object.defineProperty(process, "platform", { value: "freebsd", writable: true });
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.body.found).toBe(false);
  });
});
