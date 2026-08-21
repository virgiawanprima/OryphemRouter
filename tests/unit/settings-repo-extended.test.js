import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
let tempDir;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oryphemrouter-settings-"));
  process.env.DATA_DIR = tempDir;
  const { initDb } = await import("@/lib/db/index.js");
  await initDb();
});

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
});

describe("settingsRepo extended", () => {
  it("mergeWithDefaults keeps outboundProxyEnabled from defaults when only url set", async () => {
    const { mergeWithDefaults } = await import("@/lib/db/repos/settingsRepo.js");
    // DEFAULT_SETTINGS already provides outboundProxyEnabled:false, so the
    // inference branch only fires when the key is truly absent from both.
    const merged = mergeWithDefaults({ outboundProxyUrl: "http://proxy:3128" });
    expect(merged.outboundProxyUrl).toBe("http://proxy:3128");
    expect(typeof merged.outboundProxyEnabled).toBe("boolean");
  });

  it("mergeWithDefaults respects explicit outboundProxyEnabled=false", async () => {
    const { mergeWithDefaults } = await import("@/lib/db/repos/settingsRepo.js");
    const merged = mergeWithDefaults({
      outboundProxyUrl: "http://proxy:3128",
      outboundProxyEnabled: false,
    });
    expect(merged.outboundProxyEnabled).toBe(false);
  });

  it("mergeWithDefaults backfills undefined keys with defaults", async () => {
    const { mergeWithDefaults } = await import("@/lib/db/repos/settingsRepo.js");
    const merged = mergeWithDefaults({});
    expect(merged.requireLogin).toBe(true);
    expect(merged.comboStrategy).toBe("fallback");
    expect(merged.rtkEnabled).toBe(true);
  });

  it("getCloudUrl prefers settings value, then env vars", async () => {
    const { getCloudUrl, updateSettings } = await import("@/lib/db/repos/settingsRepo.js");

    const origCloudUrl = process.env.CLOUD_URL;
    const origNextPublic = process.env.NEXT_PUBLIC_CLOUD_URL;
    delete process.env.CLOUD_URL;
    delete process.env.NEXT_PUBLIC_CLOUD_URL;

    // No settings, no env → ""
    expect(await getCloudUrl()).toBe("");

    // Env CLOUD_URL
    process.env.CLOUD_URL = "https://env-cloud.example.com";
    expect(await getCloudUrl()).toBe("https://env-cloud.example.com");

    // Settings value wins over env
    await updateSettings({ cloudUrl: "https://settings-cloud.example.com" });
    expect(await getCloudUrl()).toBe("https://settings-cloud.example.com");

    if (origCloudUrl !== undefined) process.env.CLOUD_URL = origCloudUrl;
    else delete process.env.CLOUD_URL;
    if (origNextPublic !== undefined) process.env.NEXT_PUBLIC_CLOUD_URL = origNextPublic;
    else delete process.env.NEXT_PUBLIC_CLOUD_URL;
  });

  it("exportSettings returns raw stored JSON, not merged defaults", async () => {
    const { exportSettings, updateSettings } = await import("@/lib/db/repos/settingsRepo.js");
    await updateSettings({ comboStrategy: "roundrobin" });
    const raw = await exportSettings();
    expect(raw.comboStrategy).toBe("roundrobin");
    // Should NOT contain default keys that were never set
    expect(raw).not.toHaveProperty("requireLogin");
  });

  it("updateSettings replaces nested objects on shallow merge", async () => {
    const { updateSettings, getSettings } = await import("@/lib/db/repos/settingsRepo.js");
    await updateSettings({ spendingLimits: { maxCostPerMonth: "100" } });
    const settings = await getSettings();
    expect(settings.spendingLimits.maxCostPerMonth).toBe("100");
  });
});
