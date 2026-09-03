const FE_VERSION_PATTERN = /serp_\d{8}_\d{6}_[A-Z]{2}-[0-9a-f]{20,40}/;
const DUCKDUCKGO_DEFAULT_MODEL = "gpt-5.4-mini";
const DUCKDUCKGO_MODEL_ALIASES = {
  // retired OpenAI ids → current GPT-5.x free tier
  "gpt-4o-mini": "gpt-5.4-mini",
  "gpt-5-mini": "gpt-5.4-mini",
  "o3-mini": "gpt-5.4-mini",
  // gpt-5.4-nano left the free lineup between the 2026-07-22 and 2026-08-26 captures
  "gpt-5.4-nano": "gpt-5.4-mini",
  // retired Llama (dropped from Duck.ai free) → nearest general free model
  "llama-4-scout": "gpt-5.4-mini",
  // renamed/versioned ids
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
  "mistral-small-2501": "mistral-small-2603",
  "gpt-oss-120b": "tinfoil/gpt-oss-120b",
  "gemma4-31b": "tinfoil/gemma4-31b"
};
function normalizeDuckDuckGoModel(model) {
  if (!model) return DUCKDUCKGO_DEFAULT_MODEL;
  const clean = model.startsWith("duckduckgo-web/") ? model.slice("duckduckgo-web/".length) : model;
  return DUCKDUCKGO_MODEL_ALIASES[clean] ?? clean;
}
function pickDuckDuckGoModel(requested, liveIds) {
  if (!liveIds || liveIds.size === 0) return requested;
  if (liveIds.has(requested)) return requested;
  const aliased = DUCKDUCKGO_MODEL_ALIASES[requested] ?? requested;
  return liveIds.has(aliased) ? aliased : DUCKDUCKGO_DEFAULT_MODEL;
}
function extractFreeDuckDuckGoModelIds(value) {
  if (!value || typeof value !== "object") return /* @__PURE__ */ new Set();
  const models = value.models;
  if (!Array.isArray(models)) return /* @__PURE__ */ new Set();
  return new Set(
    models.filter((model) => {
      if (!model || typeof model !== "object") return false;
      const tiers = model.accessTier;
      return Array.isArray(tiers) && tiers.some((tier) => tier === "free");
    }).map((model) => String(model.id ?? "")).filter(Boolean)
  );
}
export {
  DUCKDUCKGO_DEFAULT_MODEL,
  DUCKDUCKGO_MODEL_ALIASES,
  FE_VERSION_PATTERN,
  extractFreeDuckDuckGoModelIds,
  normalizeDuckDuckGoModel,
  pickDuckDuckGoModel
};
