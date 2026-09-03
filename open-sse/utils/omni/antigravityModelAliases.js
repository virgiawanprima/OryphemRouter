const ANTIGRAVITY_PUBLIC_MODELS = Object.freeze([
  // Gemini 3.7 Flash tiers listed by the current official Antigravity model catalog.
  // Keep the upstream model ids unchanged so discovery and execution address the same
  // models selected by the native client.
  {
    id: "gemini-3.7-flash-high",
    name: "Gemini 3.7 Flash (High)",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  {
    id: "gemini-3.7-flash-medium",
    name: "Gemini 3.7 Flash (Medium)",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  {
    id: "gemini-3.7-flash-low",
    name: "Gemini 3.7 Flash (Low)",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  {
    id: "gemini-3.7-flash-tiered",
    name: "Gemini 3.7 Flash (Tiered)",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  // Gemini 3.1 Pro budget tiers. Live streamGenerateContent validation uses
  // `gemini-pro-agent` for High; the separately advertised `gemini-3.1-pro-high`
  // discovery slot currently returns HTTP 400 and is intentionally not public.
  {
    id: "gemini-pro-agent",
    name: "Gemini 3.1 Pro (High)",
    contextLength: 1048576,
    maxOutputTokens: 65535,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  {
    id: "gemini-3.1-pro-low",
    name: "Gemini 3.1 Pro (Low)",
    contextLength: 1048576,
    maxOutputTokens: 65535,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    contextLength: 1048576,
    maxOutputTokens: 65535,
    toolCalling: true
  },
  // Claude (Antigravity backend). The `agy` provider already ships these from the live
  // :fetchAvailableModels probe (see agyModels.ts) and discussion #3184 confirmed they
  // are user-callable through the `antigravity` OAuth provider too — same backend.
  // `antigravity/claude-opus-4-6-thinking` and `antigravity/claude-sonnet-4-6` both work.
  // They are upstream IDs, so no alias remapping is required.
  {
    id: "claude-opus-4-6-thinking",
    name: "Claude Opus 4.6 (Thinking)",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (Thinking)",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true
  },
  {
    id: "gpt-oss-120b-medium",
    name: "GPT-OSS 120B (Medium)",
    contextLength: 131072,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    toolCalling: true
  }
]);
const ANTIGRAVITY_MODEL_ALIASES = Object.freeze({
  // Gemini 3.7 Flash tiers map to the upstream tiered endpoint model; the thinking
  // budget is steered via generationConfig.thinkingConfig.thinkingBudget.
  "gemini-3.7-flash": "gemini-3.7-flash-tiered",
  "gemini-3.7-flash-high": "gemini-3.7-flash-tiered",
  "gemini-3.7-flash-medium": "gemini-3.7-flash-tiered",
  "gemini-3.7-flash-low": "gemini-3.7-flash-tiered",
  "gpt-oss-120b": "gpt-oss-120b-medium",
  // gemini-3.1-pro-low is not aliased: the upstream accepts it verbatim.
  // gemini-3.1-pro-high: the discovery slot returns HTTP 400 on v1internal;
  // the live upstream id is gemini-pro-agent (see ANTIGRAVITY_PUBLIC_MODELS).
  "gemini-3.1-pro-high": "gemini-pro-agent",
  "gemini-3-pro-image-preview": "gemini-3-pro-image",
  // Legacy Claude display ids → current upstream ids. NOTE: an earlier comment here
  // assumed Claude was removed from Antigravity 2.0 and would 404; discussion #3184
  // disproved that — the Antigravity OAuth backend still serves claude-opus-4-6-thinking
  // and claude-sonnet-4-6 (now listed in ANTIGRAVITY_PUBLIC_MODELS above). These aliases
  // remap the old gemini-claude-* ids to the live upstream ids.
  "gemini-claude-sonnet-4-5": "claude-sonnet-4-6",
  "gemini-claude-sonnet-4-5-thinking": "claude-sonnet-4-6",
  "gemini-claude-opus-4-5-thinking": "claude-opus-4-6-thinking"
});
const ANTIGRAVITY_PRO_FALLBACK_CHAINS = Object.freeze({
  "gemini-3.1-pro-low": Object.freeze(["gemini-3.1-pro-low", "gemini-3-pro-low"])
});
function getAntigravityModelFallbacks(modelId) {
  if (!modelId) return [];
  return ANTIGRAVITY_PRO_FALLBACK_CHAINS[modelId] ?? [];
}
const ANTIGRAVITY_REVERSE_MODEL_ALIASES = Object.freeze({
  "gemini-3-pro-image": "gemini-3-pro-image-preview"
});
const CLIENT_VISIBLE_MODEL_NAMES = Object.freeze(
  ANTIGRAVITY_PUBLIC_MODELS.reduce((acc, model) => {
    acc[model.id] = model.name;
    return acc;
  }, {})
);
const PUBLIC_MODEL_IDS = new Set(ANTIGRAVITY_PUBLIC_MODELS.map((model) => model.id));
const UPSTREAM_PUBLIC_MODEL_IDS = new Set(
  ANTIGRAVITY_PUBLIC_MODELS.map((model) => resolveAntigravityModelId(model.id))
);
const ANTIGRAVITY_NON_CHAT_MODEL_IDS = /* @__PURE__ */ new Set([
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "tab_flash_lite_preview",
  "tab_jump_flash_lite_preview"
]);
const ANTIGRAVITY_RETIRED_MODEL_IDS = /* @__PURE__ */ new Set([
  "gemini-3-pro-preview",
  "gemini-3.1-pro",
  "gemini-3.6-flash-high",
  "gemini-3.6-flash-medium",
  "gemini-3.6-flash-low",
  "gemini-3-flash-agent",
  "gemini-3.5-flash",
  "gemini-3.5-flash-extra-low",
  "gemini-3.5-flash-low",
  "gemini-3.5-flash-high",
  "gemini-3.5-flash-medium",
  "gemini-3.5-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash-thinking",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-computer-use-preview-10-2025"
]);
const ANTIGRAVITY_NON_CHAT_MODEL_PATTERN = /(?:^|[-_])(image|imagen|audio|tts|embedding|embed|video|veo)(?:[-_]|$)/i;
function resolveAntigravityModelId(modelId) {
  if (!modelId) return modelId;
  return ANTIGRAVITY_MODEL_ALIASES[modelId] || modelId;
}
function toClientAntigravityModelId(modelId) {
  if (!modelId) return modelId;
  return ANTIGRAVITY_REVERSE_MODEL_ALIASES[modelId] || modelId;
}
const ANTIGRAVITY_DROPPED_QUOTA_BUCKETS = /* @__PURE__ */ new Set([
  "gemini-3.5-flash-preview",
  "gemini-3-flash-preview"
]);
function toClientAntigravityQuotaModelId(modelId) {
  if (!modelId) return null;
  if (ANTIGRAVITY_DROPPED_QUOTA_BUCKETS.has(modelId) || ANTIGRAVITY_RETIRED_MODEL_IDS.has(modelId)) {
    return null;
  }
  return toClientAntigravityModelId(modelId);
}
function getClientVisibleAntigravityModelName(modelId, fallbackName) {
  return CLIENT_VISIBLE_MODEL_NAMES[modelId] || fallbackName || modelId;
}
function isUserCallableAntigravityModelId(modelId) {
  if (!modelId) return false;
  const clientId = toClientAntigravityModelId(modelId);
  const upstreamId = resolveAntigravityModelId(modelId);
  return PUBLIC_MODEL_IDS.has(clientId) || UPSTREAM_PUBLIC_MODEL_IDS.has(upstreamId);
}
function isDiscoverableAntigravityModelId(modelId) {
  const id = modelId.trim();
  if (!id || ANTIGRAVITY_NON_CHAT_MODEL_IDS.has(id) || ANTIGRAVITY_RETIRED_MODEL_IDS.has(id)) {
    return false;
  }
  return !ANTIGRAVITY_NON_CHAT_MODEL_PATTERN.test(id);
}
export {
  ANTIGRAVITY_MODEL_ALIASES,
  ANTIGRAVITY_PRO_FALLBACK_CHAINS,
  ANTIGRAVITY_PUBLIC_MODELS,
  ANTIGRAVITY_REVERSE_MODEL_ALIASES,
  getAntigravityModelFallbacks,
  getClientVisibleAntigravityModelName,
  isDiscoverableAntigravityModelId,
  isUserCallableAntigravityModelId,
  resolveAntigravityModelId,
  toClientAntigravityModelId,
  toClientAntigravityQuotaModelId
};
