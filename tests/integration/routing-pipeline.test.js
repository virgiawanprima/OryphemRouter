/**
 * Integration tests: routing pipeline — parseModel → getModelInfo.
 *
 * Verifies how a model string is split into { provider, model } and how the
 * full pipeline (including localDb-backed alias/node resolution) resolves it.
 *
 * Covered:
 *   - canonical "provider/model" strings
 *   - short alias strings ("oc/...", "kr/...") → backward-compat resolution
 *   - unknown providers → handled gracefully (passthrough, no throw)
 *   - fake model under a KNOWN provider → rejected with unknown_model (anti-fraud gate)
 *
 * Offline: no network. The src-level module touches the SQLite/localDb layer,
 * so DATA_DIR is isolated to a temp dir before import and restored afterwards.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Pure open-sse layer (no DB) — safe to import statically.
import {
  parseModel as coreParseModel,
  resolveProviderAlias,
  getModelInfoCore,
} from "open-sse/services/model.js";

// src layer (localDb-backed) — import dynamically AFTER isolating DATA_DIR so
// the DB layer initializes against a throwaway directory, never ~/.oryphemrouter.
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
let TEMP_DIR = null;
let srcModel = null; // src/sse/services/model.js module namespace

beforeAll(async () => {
  TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "oryphem-router-test-"));
  process.env.DATA_DIR = TEMP_DIR;
  // Use the @/ alias (vitest.config.js) so the dynamic import resolves against
  // the project src/ root regardless of this file's directory depth.
  srcModel = await import("@/sse/services/model.js");
});

afterAll(() => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  if (TEMP_DIR) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe("core parseModel (open-sse/services/model.js)", () => {
  it('parses "openai/gpt-4o" → { provider: "openai", model: "gpt-4o" }', () => {
    expect(coreParseModel("openai/gpt-4o")).toEqual({
      provider: "openai",
      model: "gpt-4o",
      isAlias: false,
      providerAlias: "openai",
    });
  });

  it('parses "anthropic/claude-3-5-sonnet-20241022" → { provider: "anthropic", model: "..." }', () => {
    const parsed = coreParseModel("anthropic/claude-3-5-sonnet-20241022");
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.model).toBe("claude-3-5-sonnet-20241022");
    expect(parsed.isAlias).toBe(false);
  });

  it("splits on the FIRST slash only (nested model ids are preserved)", () => {
    const parsed = coreParseModel("openrouter/openai/gpt-4o");
    expect(parsed.provider).toBe("openrouter");
    expect(parsed.model).toBe("openai/gpt-4o");
  });

  it("treats a bare model name as an alias-style string (no provider)", () => {
    const parsed = coreParseModel("gpt-4o");
    expect(parsed.isAlias).toBe(true);
    expect(parsed.provider).toBeNull();
    expect(parsed.model).toBe("gpt-4o");
  });

  it("handles empty/undefined input without throwing", () => {
    expect(coreParseModel("").provider).toBeNull();
    expect(coreParseModel(null).provider).toBeNull();
    expect(coreParseModel(undefined).provider).toBeNull();
  });
});

describe("resolveProviderAlias", () => {
  it("resolves short aliases to canonical provider ids", () => {
    expect(resolveProviderAlias("oc")).toBe("opencode");
    expect(resolveProviderAlias("kr")).toBe("kiro");
    expect(resolveProviderAlias("cu")).toBe("cursor");
    expect(resolveProviderAlias("openai")).toBe("openai");
  });

  it("passes through unknown providers unchanged (handled gracefully downstream)", () => {
    expect(resolveProviderAlias("fakeprovider")).toBe("fakeprovider");
    expect(resolveProviderAlias("definitely-not-a-provider")).toBe("definitely-not-a-provider");
  });
});

describe("getModelInfoCore (alias map resolution)", () => {
  it("resolves a provider/model string directly", async () => {
    const info = await getModelInfoCore("openai/gpt-4o", {});
    expect(info).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("resolves a bare model name via prefix inference (gpt- → openai)", async () => {
    const info = await getModelInfoCore("gpt-4o", {});
    expect(info).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("resolves a custom alias map entry", async () => {
    const aliases = { "my-model": "anthropic/claude-3-5-sonnet-20241022" };
    const info = await getModelInfoCore("my-model", aliases);
    expect(info).toEqual({ provider: "anthropic", model: "claude-3-5-sonnet-20241022" });
  });
});

describe("src parseModel (localDb-aware, backward-compat aliases)", () => {
  it('resolves "oc/gpt-4o" to opencode (backward compat)', () => {
    const parsed = srcModel.parseModel("oc/gpt-4o");
    expect(parsed.provider).toBe("opencode");
    expect(parsed.model).toBe("gpt-4o");
    // Short alias preserved + deprecation flag set (warn clients, don't reject).
    expect(parsed.originalProviderAlias).toBe("oc");
    expect(parsed.deprecation).toBe(true);
  });

  it('resolves "kr/claude-sonnet-4.5" to kiro (backward compat)', () => {
    const parsed = srcModel.parseModel("kr/claude-sonnet-4.5");
    expect(parsed.provider).toBe("kiro");
    expect(parsed.model).toBe("claude-sonnet-4.5");
  });

  it("resolves canonical providers identically to the core parser", () => {
    const parsed = srcModel.parseModel("openai/gpt-4o");
    expect(parsed.provider).toBe("openai");
    expect(parsed.model).toBe("gpt-4o");
  });
});

describe("src getModelInfo — full pipeline", () => {
  it('routes "openai/gpt-4o" through the full pipeline', async () => {
    const info = await srcModel.getModelInfo("openai/gpt-4o");
    expect(info).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it('routes "anthropic/claude-3-5-sonnet-20241022" through the full pipeline', async () => {
    const info = await srcModel.getModelInfo("anthropic/claude-3-5-sonnet-20241022");
    expect(info).toEqual({ provider: "anthropic", model: "claude-3-5-sonnet-20241022" });
  });

  it('routes "oc/gpt-4o" to opencode (backward-compat alias survives the pipeline)', async () => {
    const info = await srcModel.getModelInfo("oc/gpt-4o");
    expect(info.provider).toBe("opencode");
    expect(info.model).toBe("gpt-4o");
  });

  it("handles an unknown provider gracefully (passthrough, no throw)", async () => {
    // fakeprovider has no registry entry → known models list is empty → the
    // anti-fraud gate bails out early and the string is routed as-is.
    const info = await srcModel.getModelInfo("fakeprovider/gpt-4o");
    expect(info).toEqual({ provider: "fakeprovider", model: "gpt-4o" });
  });

  it("rejects a fake model under a KNOWN provider (anti-fraud gate)", async () => {
    // "openai" is a known provider with a catalog → unknown model id must throw.
    await expect(srcModel.getModelInfo("openai/gpt-4o-fake")).rejects.toMatchObject({
      code: "unknown_model",
      status: 400,
    });
  });
});
