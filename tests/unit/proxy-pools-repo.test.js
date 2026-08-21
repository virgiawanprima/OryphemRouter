import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
let tempDir;

beforeEach(async () => {
  // Clear the global DB adapter state so each test gets a fresh DB
  if (global._dbAdapter) { global._dbAdapter = { instance: null, initPromise: null, logged: false }; }
  vi.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oryphemrouter-pools-"));
  process.env.DATA_DIR = tempDir;
  const { initDb } = await import("@/lib/db/index.js");
  await initDb();
});

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
});

describe("proxyPoolsRepo", () => {
  it("creates a pool with defaults", async () => {
    const { createProxyPool, getProxyPoolById } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const pool = await createProxyPool({ name: "test", proxyUrl: "http://proxy:8080" });
    expect(pool.id).toBeTruthy();
    expect(pool.type).toBe("http");
    expect(pool.isActive).toBe(true);
    expect(pool.testStatus).toBe("unknown");
    const fetched = await getProxyPoolById(pool.id);
    expect(fetched.name).toBe("test");
    expect(fetched.proxyUrl).toBe("http://proxy:8080");
  });

  it("updates a pool with partial data", async () => {
    const { createProxyPool, updateProxyPool, getProxyPoolById } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const pool = await createProxyPool({ name: "orig", proxyUrl: "http://p:8080" });
    const updated = await updateProxyPool(pool.id, { name: "renamed", testStatus: "up" });
    expect(updated.name).toBe("renamed");
    expect(updated.testStatus).toBe("up");
    expect(updated.proxyUrl).toBe("http://p:8080"); // preserved
  });

  it("returns null when updating a missing pool", async () => {
    const { updateProxyPool } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    expect(await updateProxyPool("nonexistent", { name: "x" })).toBeNull();
  });

  it("deletes a pool and returns the removed object", async () => {
    const { createProxyPool, deleteProxyPool, getProxyPoolById } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const pool = await createProxyPool({ name: "to-delete", proxyUrl: "http://p:8080" });
    const removed = await deleteProxyPool(pool.id);
    expect(removed.id).toBe(pool.id);
    expect(await getProxyPoolById(pool.id)).toBeNull();
  });

  it("returns null when deleting a missing pool", async () => {
    const { deleteProxyPool } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    expect(await deleteProxyPool("nonexistent")).toBeNull();
  });

  it("filters by isActive and testStatus", async () => {
    const { createProxyPool, getProxyPools } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    await createProxyPool({ name: "active", proxyUrl: "http://a:8080", isActive: true, testStatus: "up" });
    await createProxyPool({ name: "inactive", proxyUrl: "http://b:8080", isActive: false, testStatus: "down" });
    const active = await getProxyPools({ isActive: true });
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("active");
    const down = await getProxyPools({ testStatus: "down" });
    expect(down).toHaveLength(1);
    expect(down[0].name).toBe("inactive");
  });

  it("sorts by updatedAt descending", async () => {
    const { createProxyPool, getProxyPools } = await import("@/lib/db/repos/proxyPoolsRepo.js");
    const a = await createProxyPool({ name: "first", proxyUrl: "http://a:8080" });
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 10));
    const b = await createProxyPool({ name: "second", proxyUrl: "http://b:8080" });
    const list = await getProxyPools();
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });
});
