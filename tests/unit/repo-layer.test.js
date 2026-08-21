import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
let tempDir;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oryphemrouter-repo-"));
  process.env.DATA_DIR = tempDir;
  const { initDb } = await import("@/lib/db/index.js");
  await initDb();
});

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
});

describe("settingsRepo", () => {
  it("merges defaults when no settings row exists", async () => {
    const { getSettings } = await import("@/lib/db/repos/settingsRepo.js");
    const settings = await getSettings();
    expect(settings.requireLogin).toBe(true);
    expect(settings.cloudEnabled).toBe(false);
  });

  it("persists updates and merges on read", async () => {
    const { getSettings, updateSettings } = await import("@/lib/db/repos/settingsRepo.js");
    await updateSettings({ comboStrategy: "roundrobin", rtkEnabled: false });
    const settings = await getSettings();
    expect(settings.comboStrategy).toBe("roundrobin");
    expect(settings.rtkEnabled).toBe(false);
    // untouched default key survives merge
    expect(settings.cavemanEnabled).toBe(false);
  });

  it("isCloudEnabled reflects the cloud flag", async () => {
    const { updateSettings, isCloudEnabled } = await import("@/lib/db/repos/settingsRepo.js");
    expect(await isCloudEnabled()).toBe(false);
    await updateSettings({ cloudEnabled: true });
    expect(await isCloudEnabled()).toBe(true);
  });
});

describe("nodesRepo", () => {
  it("creates, reads, filters, updates, and deletes a node", async () => {
    const repo = await import("@/lib/db/repos/nodesRepo.js");
    const created = await repo.createProviderNode({
      type: "openai-compatible",
      name: "Edge Node",
      prefix: "edge-",
      apiType: "openai",
      baseUrl: "http://localhost:9999/v1",
    });
    expect(created.id).toBeTruthy();

    const byId = await repo.getProviderNodeById(created.id);
    expect(byId.name).toBe("Edge Node");
    expect(byId.baseUrl).toBe("http://localhost:9999/v1");

    const filtered = await repo.getProviderNodes({ type: "openai-compatible" });
    expect(filtered.length).toBe(1);
    expect(await repo.getProviderNodes({ type: "anthropic" })).toHaveLength(0);

    const updated = await repo.updateProviderNode(created.id, { name: "Renamed" });
    expect(updated.name).toBe("Renamed");
    expect(updated.baseUrl).toBe("http://localhost:9999/v1");

    const removed = await repo.deleteProviderNode(created.id);
    expect(removed.id).toBe(created.id);
    expect(await repo.getProviderNodeById(created.id)).toBeNull();
  });

  it("returns null for missing node on update/delete", async () => {
    const repo = await import("@/lib/db/repos/nodesRepo.js");
    expect(await repo.updateProviderNode("nope", { name: "x" })).toBeNull();
    expect(await repo.deleteProviderNode("nope")).toBeNull();
  });
});
