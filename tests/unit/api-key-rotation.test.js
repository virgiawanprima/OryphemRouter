import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * API Key Rotation & Failover — account-level quota lock.
 *
 * Requirement: when a key's quota is exhausted (401/402/403/429), that key must
 * not be retried for ANY model — requests for other models must fall through to
 * the next healthy key in the same provider.
 *
 * We test the pure logic of markAccountUnavailable (auth.js) + the accountFallback
 * helpers it builds on, without any real DB/network.
 */

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  updateProviderConnection: mocks.updateProviderConnection,
}));

// accountFallback is pure — import real implementation (no DB).
import { isModelLockActive, buildModelLockUpdate, getModelLockKey } from "open-sse/services/accountFallback.js";
// auth.js imports accountFallback too; give it the same mocked localDb.
import { markAccountUnavailable } from "@/sse/services/auth.js";

const KEY1 = "conn-key-1";
const KEY2 = "conn-key-2";

function makeConnection(id, overrides = {}) {
  return {
    id,
    displayName: `Key ${id}`,
    priority: 1,
    ...overrides,
  };
}

// markAccountUnavailable writes twice: (1) circuit-breaker counters,
// (2) the modelLock + testStatus patch. The LOCK patch is the one that carries
// modelLock_* / testStatus. Grab that one.
function getLockPatch() {
  for (const [, patch] of mocks.updateProviderConnection.mock.calls) {
    if (patch && (patch.testStatus === "unavailable" || Object.keys(patch).some((k) => k.startsWith("modelLock_")))) {
      return patch;
    }
  }
  return null;
}

describe("API key rotation — account-level quota lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderConnections.mockResolvedValue([makeConnection(KEY1), makeConnection(KEY2)]);
    mocks.updateProviderConnection.mockResolvedValue({});
  });

  it("429 on key1 locks it at ACCOUNT level (modelLock___all), not per-model", async () => {
    await markAccountUnavailable(KEY1, 429, "rate limit exceeded", "openai", "gpt-4o");

    const patch = getLockPatch();
    expect(patch).not.toBeNull();
    expect(patch).toHaveProperty("modelLock___all");
    expect(patch).not.toHaveProperty("modelLock_gpt-4o");
    expect(patch.testStatus).toBe("unavailable");
    expect(patch.errorCode).toBe(429);
  });

  it("403 on key1 locks account-wide; another model on key1 is blocked too", async () => {
    await markAccountUnavailable(KEY1, 403, "insufficient_quota", "openai", "gpt-4o");

    const patch = getLockPatch();
    const lockedUntil = patch.modelLock___all;

    // isModelLockActive(key1, ANY model) must be true while the account lock is set
    const lockedConn = makeConnection(KEY1, { modelLock___all: lockedUntil });
    expect(isModelLockActive(lockedConn, "gpt-4o")).toBe(true);
    expect(isModelLockActive(lockedConn, "gpt-4o-mini")).toBe(true);
    expect(isModelLockActive(lockedConn, "claude-sonnet-4")).toBe(true);
  });

  it("429 fallback: key2 (healthy) is picked when key1 is account-locked", async () => {
    await markAccountUnavailable(KEY1, 429, "rate limit", "openai", "gpt-4o");
    const patch = getLockPatch();

    const key1 = makeConnection(KEY1, { modelLock___all: patch.modelLock___all });
    const key2 = makeConnection(KEY2);

    // Selection filter (mirrors getProviderCredentials availableConnections)
    const available = [key1, key2].filter((c) => !isModelLockActive(c, "gpt-4o"));
    expect(available.map((c) => c.id)).toEqual([KEY2]);
  });

  it("429 on key1 blocks a DIFFERENT model request too (request-level exclusion)", async () => {
    await markAccountUnavailable(KEY1, 429, "rate limit", "openai", "gpt-4o");
    const patch = getLockPatch();
    const key1 = makeConnection(KEY1, { modelLock___all: patch.modelLock___all });

    // Even a request for gpt-4o-mini (different model) skips key1
    expect(isModelLockActive(key1, "gpt-4o-mini")).toBe(true);
  });

  it("transient 500 stays PER-MODEL — other models can still use key1", async () => {
    await markAccountUnavailable(KEY1, 500, "internal server error", "openai", "gpt-4o");

    const patch = getLockPatch();
    expect(patch).toHaveProperty("modelLock_gpt-4o");
    expect(patch).not.toHaveProperty("modelLock___all");

    const key1 = makeConnection(KEY1, { "modelLock_gpt-4o": patch["modelLock_gpt-4o"] });
    expect(isModelLockActive(key1, "gpt-4o")).toBe(true);       // this model blocked
    expect(isModelLockActive(key1, "gpt-4o-mini")).toBe(false); // others still usable
  });

  it("buildModelLockUpdate(null) produces modelLock___all key", () => {
    const update = buildModelLockUpdate(null, 60_000);
    expect(Object.keys(update)).toEqual(["modelLock___all"]);
    expect(getModelLockKey("gpt-4o")).toBe("modelLock_gpt-4o");
    expect(getModelLockKey(null)).toBe("modelLock___all");
  });

  it("all keys exhausted → no healthy key remains (fallback exhausted)", async () => {
    await markAccountUnavailable(KEY1, 429, "rate limit", "openai", "gpt-4o");
    await markAccountUnavailable(KEY2, 429, "rate limit", "openai", "gpt-4o");

    const locks = {};
    for (const call of mocks.updateProviderConnection.mock.calls) {
      const id = call[0];
      const patch = call[1];
      if (patch && patch.modelLock___all) locks[id] = patch.modelLock___all;
    }

    const conns = [KEY1, KEY2].map((id) => makeConnection(id, { modelLock___all: locks[id] }));
    const available = conns.filter((c) => !isModelLockActive(c, "gpt-4o"));
    expect(available).toHaveLength(0); // all exhausted → no healthy key
  });
});
