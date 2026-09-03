const ALIBABA_PROVIDER_REGION_VALUES = ["global-sg", "china-beijing"];
const ALIBABA_PROVIDER_ENDPOINTS = {
  alibaba: {
    "global-sg": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "china-beijing": "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
  // The catalog entry is the personal TOKEN Plan (see providers/apikey/regional.ts:
  // name "Alibaba Token Plan"). The legacy coding-intl/coding hosts serve the separate
  // Coding Plan product and reject Token Plan keys with 401 invalid_api_key — verified
  // live 2026-08-18 against the same key that returns 429 (quota) on the host below.
  // Keeps /apps/anthropic/v1 because the registry entry is format "claude".
  "bailian-coding-plan": {
    "global-sg": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1",
    "china-beijing": "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1"
  },
  "qwen-cloud": {
    "global-sg": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "china-beijing": "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
  "qwen-cloud-token-plan": {
    "global-sg": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    "china-beijing": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
  }
};
const REGIONAL_PROVIDER_IDS = /* @__PURE__ */ new Set([
  "alibaba",
  "alibaba-cn",
  "bailian-coding-plan",
  "qwen-cloud",
  "qwen-cloud-token-plan"
]);
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function canonicalProviderFamily(providerId) {
  if (providerId === "alibaba-cn") return "alibaba";
  if (providerId === "alibaba" || providerId === "bailian-coding-plan" || providerId === "qwen-cloud" || providerId === "qwen-cloud-token-plan") {
    return providerId;
  }
  return null;
}
const SLASH_CHAR_CODE = 47;
function stripTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH_CHAR_CODE) end--;
  return end === value.length ? value : value.slice(0, end);
}
function normalizeEndpoint(value) {
  return stripTrailingSlashes(value.trim()).replace(/\/(?:chat\/completions|messages)$/i, "").toLowerCase();
}
const LEGACY_FAMILY_PRESETS = {
  alibaba: [],
  // Retired 2026-08-18 — Coding Plan hosts, wrong product for this Token Plan entry.
  "bailian-coding-plan": [
    "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1",
    "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1"
  ],
  "qwen-cloud": [],
  "qwen-cloud-token-plan": []
};
const ALIBABA_PROVIDER_MEDIA_OVERRIDES = {
  "bailian-coding-plan": {
    "global-sg": "https://coding-intl.dashscope.aliyuncs.com/api/v1",
    "china-beijing": "https://coding.dashscope.aliyuncs.com/api/v1"
  }
};
function isFamilyPresetUrl(family, value) {
  const normalized = normalizeEndpoint(value);
  const isCurrentPreset = ALIBABA_PROVIDER_REGION_VALUES.some(
    (region) => normalizeEndpoint(ALIBABA_PROVIDER_ENDPOINTS[family][region]) === normalized
  );
  if (isCurrentPreset) return true;
  return LEGACY_FAMILY_PRESETS[family].some((preset) => normalizeEndpoint(preset) === normalized);
}
function isAlibabaRegionalProvider(providerId) {
  return typeof providerId === "string" && REGIONAL_PROVIDER_IDS.has(providerId);
}
function getDefaultAlibabaProviderRegion(providerId) {
  return providerId === "alibaba-cn" ? "china-beijing" : "global-sg";
}
function normalizeAlibabaProviderRegion(value, fallback = "global-sg") {
  if (typeof value !== "string") return fallback;
  switch (value.trim().toLowerCase()) {
    case "global-sg":
    case "global":
    case "international":
    case "singapore":
    case "ap-southeast-1":
      return "global-sg";
    case "china-beijing":
    case "china":
    case "cn":
    case "beijing":
    case "cn-beijing":
      return "china-beijing";
    default:
      return fallback;
  }
}
function resolveAlibabaProviderRegion(providerId, providerSpecificData) {
  const fallback = getDefaultAlibabaProviderRegion(providerId);
  return normalizeAlibabaProviderRegion(asRecord(providerSpecificData).region, fallback);
}
function resolveAlibabaProviderBaseUrl(providerId, providerSpecificData, fallback = "") {
  const family = canonicalProviderFamily(providerId);
  const data = asRecord(providerSpecificData);
  const configuredBaseUrl = typeof data.baseUrl === "string" && data.baseUrl.trim() ? data.baseUrl.trim() : "";
  if (!family) return configuredBaseUrl || fallback;
  if (configuredBaseUrl && !isFamilyPresetUrl(family, configuredBaseUrl)) {
    return configuredBaseUrl;
  }
  const region = resolveAlibabaProviderRegion(providerId, data);
  return ALIBABA_PROVIDER_ENDPOINTS[family][region];
}
function resolveAlibabaProviderModelsUrl(providerId, providerSpecificData, fallback = "") {
  const baseUrl = stripTrailingSlashes(
    resolveAlibabaProviderBaseUrl(providerId, providerSpecificData, fallback).trim()
  ).replace(/\/(?:chat\/completions|messages|models)$/i, "");
  return baseUrl ? `${baseUrl}/models` : "";
}
function resolveAlibabaProviderMediaBaseUrl(providerId, providerSpecificData, fallback = "") {
  const family = canonicalProviderFamily(providerId);
  const data = asRecord(providerSpecificData);
  const configuredBaseUrl = typeof data.baseUrl === "string" && data.baseUrl.trim() ? data.baseUrl.trim() : "";
  const mediaOverride = family ? ALIBABA_PROVIDER_MEDIA_OVERRIDES[family] : void 0;
  if (family && mediaOverride && (!configuredBaseUrl || isFamilyPresetUrl(family, configuredBaseUrl))) {
    return mediaOverride[resolveAlibabaProviderRegion(providerId, data)];
  }
  return stripTrailingSlashes(
    resolveAlibabaProviderBaseUrl(providerId, providerSpecificData, fallback).trim()
  ).replace(/\/compatible-mode\/v1(?:\/(?:chat\/completions|models))?$/i, "/api/v1").replace(/\/apps\/anthropic(?:\/v1)?(?:\/messages)?$/i, "/api/v1");
}
export {
  ALIBABA_PROVIDER_ENDPOINTS,
  ALIBABA_PROVIDER_REGION_VALUES,
  getDefaultAlibabaProviderRegion,
  isAlibabaRegionalProvider,
  normalizeAlibabaProviderRegion,
  resolveAlibabaProviderBaseUrl,
  resolveAlibabaProviderMediaBaseUrl,
  resolveAlibabaProviderModelsUrl,
  resolveAlibabaProviderRegion
};
