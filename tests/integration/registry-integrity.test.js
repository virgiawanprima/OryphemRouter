/**
 * Integration tests: provider/model registry integrity.
 *
 * Loads the entire registry (open-sse/providers/registry/* via the auto-generated
 * index) and asserts structural invariants that keep routing safe:
 *
 *   1. every provider entry has an id and a display name
 *   2. every model entry has an id and a name (post-normalization)
 *   3. no duplicate provider ids
 *   4. no provider id contains "/" (the routing separator lives between
 *      provider and model, so provider ids must never contain one)
 *   5. model ids containing "/" are limited to an explicit allowlist of
 *      catalog/namespace providers that intentionally ship qualified ids
 *   6. no model id is a reserved routing word (auto / default / api), except
 *      the documented "default" sentinel on Cursor
 *
 * Offline: pure static data assertions, no network.
 */

import { describe, it, expect } from "vitest";
import REGISTRY from "open-sse/providers/registry/index.js";
import { PROVIDER_MODELS } from "open-sse/providers/index.js";
import { normalizeModel } from "open-sse/providers/models/schema.js";

const RESERVED_MODEL_WORDS = ["auto", "default", "api"];

// Model ids that legitimately contain "/" (namespace/catalog-qualified ids:
// e.g. huggingface "meta-llama/...", openrouter "openai/gpt-4o", cloudflare
// "@cf/meta/..."). Routing splits on the FIRST slash, so these are safe.
const SLASH_MODEL_ID_PROVIDERS = new Set([
  "api-airforce", "cline", "clinepass", "cloudflare-ai", "commandcode",
  "fal-ai", "featherless", "fireworks", "groq", "huggingface", "hyperbolic",
  "kilo-gateway", "kilocode", "nebius", "nvidia", "openrouter",
  "perplexity-agent", "poolside", "siliconflow", "together", "tokenrouter",
  "vertex-partner",
]);

// Model ids equal to a reserved word that are intentionally allowed.
// cursor's "default" is a real sentinel ("Managed — Auto (server memilih model)").
const RESERVED_MODEL_WORD_ALLOWLIST = new Set(["cursor:default"]);

// Gather every (providerId, modelEntry) pair once.
const ALL_MODELS = [];
for (const entry of REGISTRY) {
  for (const raw of entry.models || []) {
    ALL_MODELS.push({ providerId: entry.id, model: normalizeModel(raw) });
  }
}

describe("registry integrity — provider entries", () => {
  it("every provider entry has an id", () => {
    const missing = REGISTRY.filter((r) => !r.id || typeof r.id !== "string");
    expect(missing).toEqual([]);
  });

  it("every provider entry has a display name", () => {
    // NOTE: this registry stores names under `display.name` (not top-level `name`).
    const missing = REGISTRY.filter((r) => !r.display?.name);
    expect(missing.map((r) => r.id)).toEqual([]);
  });

  it("has no duplicate provider ids", () => {
    const ids = REGISTRY.map((r) => r.id);
    const seen = new Set();
    const duplicates = ids.filter((id) => (seen.has(id) ? true : !seen.add(id)));
    expect(duplicates).toEqual([]);
  });

  it("has no duplicate aliases that would make resolution ambiguous", () => {
    // Two providers share "qianfan" (baidu) and "hunyuan" (tencent) — each maps to
    // itself, so resolution is stable. Everything else must be unique.
    const map = new Map();
    const ambiguous = [];
    for (const r of REGISTRY) {
      for (const a of [r.alias, ...(r.aliases || [])]) {
        if (!a) continue;
        if (map.has(a) && map.get(a) !== r.id) {
          // only flag when the two targets differ
          ambiguous.push(`${a}: ${map.get(a)} vs ${r.id}`);
        } else {
          map.set(a, r.id);
        }
      }
    }
    expect(ambiguous).toEqual([]);
  });

  it("no provider id contains '/' (routing separator)", () => {
    const offenders = REGISTRY.filter((r) => r.id.includes("/")).map((r) => r.id);
    expect(offenders).toEqual([]);
  });
});

describe("registry integrity — model entries", () => {
  it("every model entry has an id", () => {
    const missing = ALL_MODELS.filter(({ model }) => !model.id || typeof model.id !== "string");
    expect(missing.map((m) => `${m.providerId}:${m.model?.id}`)).toEqual([]);
  });

  it("every model entry has a name (post-normalization)", () => {
    const missing = ALL_MODELS.filter(({ model }) => !model.name);
    expect(missing.map((m) => `${m.providerId}:${m.model?.id}`)).toEqual([]);
  });

  it("model ids containing '/' are limited to the documented allowlist", () => {
    // Regression guard: if a NEW provider starts shipping slash-qualified ids it
    // must be added to SLASH_MODEL_ID_PROVIDERS (and its routing verified).
    const offenders = ALL_MODELS
      .filter(({ providerId, model }) => String(model.id).includes("/") && !SLASH_MODEL_ID_PROVIDERS.has(providerId))
      .map((m) => `${m.providerId}:${m.model.id}`);
    expect(offenders).toEqual([]);
  });

  it("no model id is a reserved routing word (auto / default / api)", () => {
    const offenders = ALL_MODELS
      .filter(({ providerId, model }) => RESERVED_MODEL_WORDS.includes(String(model.id).toLowerCase()))
      .map((m) => `${m.providerId}:${m.model.id}`)
      .filter((key) => !RESERVED_MODEL_WORD_ALLOWLIST.has(key));
    expect(offenders).toEqual([]);
  });

  it("documents the intentional reserved-word exceptions", () => {
    // Cursor's "default" sentinel is allowed (server-managed model selection).
    const cursorDefault = ALL_MODELS.find(
      ({ providerId, model }) => providerId === "cursor" && model.id === "default"
    );
    expect(cursorDefault).toBeTruthy();
  });

  it("PROVIDER_MODELS is keyed only by canonical registry ids", () => {
    const canonical = new Set(REGISTRY.map((r) => r.id));
    const badKeys = Object.keys(PROVIDER_MODELS).filter((k) => !canonical.has(k));
    // TTS model tables are keyed by special names (openai-tts-models, ...) — those
    // are not provider ids and are exempt from this invariant.
    const exempt = badKeys.filter((k) => k.endsWith("-tts-models") || k.includes("-tts"));
    expect(badKeys.filter((k) => !exempt.includes(k))).toEqual([]);
  });
});

describe("registry integrity — informational snapshots (not assertions)", () => {
  it("reports registry size for observability", () => {
    // Sanity floor — the registry must never shrink to nothing.
    expect(REGISTRY.length).toBeGreaterThan(50);
    expect(ALL_MODELS.length).toBeGreaterThan(500);
  });

  it("documents known duplicate model ids within a provider (gemini)", () => {
    // gemini lists gemini-2.5-pro / 2.5-flash / 2.5-flash-lite twice (different
    // kinds). Tracked here so a NEW duplicate elsewhere gets caught.
    const seen = new Set();
    const duplicates = [];
    for (const { providerId, model } of ALL_MODELS) {
      const key = `${providerId}:${model.id}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates.filter((k) => !k.startsWith("gemini:"))).toEqual([]);
  });
});
