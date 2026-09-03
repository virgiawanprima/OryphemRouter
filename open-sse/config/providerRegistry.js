export * from "../providers/shared.js";
import { ALIBABA_MODEL_STUDIO_MODELS } from "../providers/registry/alibaba/index.js";
import REGISTRY2 from "../providers/registry/index.js";
const REGISTRY = REGISTRY2;
import { isPrivateHost } from "../utils/privateHost.js";
function generateLegacyProviders() {
  const providers = {};
  for (const [id, entry] of REGISTRY2.map((e) => [e.id, e])) {
    const p = { format: entry.format };
    if (entry.baseUrls) {
      p.baseUrls = entry.baseUrls;
    } else if (entry.baseUrl) {
      p.baseUrl = entry.baseUrl;
    }
    if (entry.responsesBaseUrl) {
      p.responsesBaseUrl = entry.responsesBaseUrl;
    }
    if (entry.messagesUrl) {
      p.messagesUrl = entry.messagesUrl;
    }
    if (entry.requestDefaults) {
      p.requestDefaults = entry.requestDefaults;
    }
    if (typeof entry.timeoutMs === "number") {
      p.timeoutMs = entry.timeoutMs;
    }
    const mergedHeaders = {
      ...entry.headers || {},
      ...entry.extraHeaders || {}
    };
    if (Object.keys(mergedHeaders).length > 0) {
      p.headers = mergedHeaders;
    }
    if (entry.oauth) {
      if (entry.oauth.clientIdEnv) {
        p.clientId = process.env[entry.oauth.clientIdEnv] || entry.oauth.clientIdDefault;
      }
      if (entry.oauth.clientSecretEnv) {
        p.clientSecret = process.env[entry.oauth.clientSecretEnv] || entry.oauth.clientSecretDefault;
      }
      if (entry.oauth.tokenUrl) p.tokenUrl = entry.oauth.tokenUrl;
      if (entry.oauth.refreshUrl) p.refreshUrl = entry.oauth.refreshUrl;
      if (entry.oauth.authUrl) p.authUrl = entry.oauth.authUrl;
    }
    if (entry.chatPath) p.chatPath = entry.chatPath;
    if (entry.clientVersion) p.clientVersion = entry.clientVersion;
    providers[id] = p;
  }
  return providers;
}
function generateModels() {
  const models = {};
  for (const entry of Object.values(REGISTRY2)) {
    if (entry.models && entry.models.length > 0) {
      const key = entry.alias || entry.id;
      if (!models[key]) {
        models[key] = entry.models;
      }
    }
  }
  return models;
}
function generateAliasMap() {
  const map = {};
  for (const entry of Object.values(REGISTRY2)) {
    map[entry.id] = entry.alias || entry.id;
  }
  return map;
}
const LOCAL_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  ...typeof process !== "undefined" && process.env.LOCAL_HOSTNAMES ? process.env.LOCAL_HOSTNAMES.split(",").map((h) => h.trim()).filter(Boolean) : []
]);
function isLocalProvider(baseUrl) {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname;
    if (!hostname) return false;
    return LOCAL_HOSTNAMES.has(hostname) || isPrivateHost(hostname);
  } catch {
    return false;
  }
}
let _passthroughProviderIds = null;
function ensurePassthroughProviderIds() {
  if (_passthroughProviderIds) return _passthroughProviderIds;
  try {
    const ids = /* @__PURE__ */ new Set();
    for (const entry of Object.values(REGISTRY2)) {
      if (entry.passthroughModels) ids.add(entry.id);
    }
    _passthroughProviderIds = ids;
  } catch {
    _passthroughProviderIds = /* @__PURE__ */ new Set();
  }
  return _passthroughProviderIds;
}
function getPassthroughProviders() {
  return ensurePassthroughProviderIds();
}
const _byAlias = /* @__PURE__ */ new Map();
let _byAliasPopulated = false;
function ensureByAliasPopulated() {
  if (_byAliasPopulated) return;
  _byAliasPopulated = true;
  for (const entry of Object.values(REGISTRY2)) {
    if (entry.alias && entry.alias !== entry.id) {
      _byAlias.set(entry.alias, entry);
    }
  }
}
function getRegistryEntry(provider) {
  ensureByAliasPopulated();
  return REGISTRY2.find((e) => e.id === provider) || _byAlias.get(provider) || null;
}
function getRegistryModelThinkingEfforts(provider, modelId) {
  const entry = getRegistryEntry(provider);
  if (!entry) return void 0;
  const model = entry.models.find((candidate) => candidate.id === modelId);
  return model?.supportedThinkingEfforts;
}
function getRegistryThinkingEfforts(provider, modelId) {
  const entry = getRegistryEntry(provider);
  if (!entry) return void 0;
  const modelEfforts = getRegistryModelThinkingEfforts(provider, modelId);
  if (modelEfforts !== void 0) return modelEfforts;
  return entry.defaultSupportedThinkingEfforts;
}
function providerUsesAuthoritativeLiveCatalog(provider) {
  const entry = getRegistryEntry(provider);
  if (entry && typeof entry.liveCatalogAuthoritative === "boolean") {
    return entry.liveCatalogAuthoritative;
  }
  return true;
}
function getRegisteredProviders() {
  return REGISTRY2.map((e) => e.id);
}
const _unsupportedParamsMap = /* @__PURE__ */ new Map();
let _unsupportedParamsPopulated = false;
function ensureUnsupportedParamsPopulated() {
  if (_unsupportedParamsPopulated) return;
  _unsupportedParamsPopulated = true;
  for (const entry of Object.values(REGISTRY2)) {
    for (const model of entry.models ?? []) {
      if (model.unsupportedParams && !_unsupportedParamsMap.has(model.id)) {
        _unsupportedParamsMap.set(model.id, model.unsupportedParams);
      }
    }
  }
}
function getUnsupportedParams(provider, modelId) {
  ensureUnsupportedParamsPopulated();
  const entry = getRegistryEntry(provider);
  const modelEntry = entry?.models?.find((m) => m.id === modelId);
  if (modelEntry?.unsupportedParams) return modelEntry.unsupportedParams;
  const cached = _unsupportedParamsMap.get(modelId);
  if (cached) return cached;
  if (modelId.includes("/")) {
    const bareId = modelId.split("/").pop() || "";
    const bare = _unsupportedParamsMap.get(bareId);
    if (bare) return bare;
  }
  if (entry?.unsupportedParams) return entry.unsupportedParams;
  return [];
}
function requiresPlainStringContent(provider) {
  return getRegistryEntry(provider)?.requiresPlainStringContent === true;
}
function getProviderCategory(provider) {
  const entry = getRegistryEntry(provider);
  if (!entry) return "apikey";
  return entry.authType === "apikey" ? "apikey" : "oauth";
}
function getClaudeCodeDefaultModels() {
  const models = REGISTRY2.find((e) => e.id === "claude")?.models ?? [];
  const find = (pattern) => models.find((m) => pattern.test(m.id))?.id ?? "";
  return {
    fable: find(/fable/i),
    opus: find(/opus/i),
    sonnet: find(/sonnet/i),
    haiku: find(/haiku/i)
  };
}
export {
  ALIBABA_MODEL_STUDIO_MODELS as ALIBABA_DASHSCOPE_MODELS,
  ALIBABA_MODEL_STUDIO_MODELS,
  REGISTRY,
  generateAliasMap,
  generateLegacyProviders,
  generateModels,
  getClaudeCodeDefaultModels,
  getPassthroughProviders,
  getProviderCategory,
  getRegisteredProviders,
  getRegistryEntry,
  getRegistryModelThinkingEfforts,
  getRegistryThinkingEfforts,
  getUnsupportedParams,
  isLocalProvider,
  providerUsesAuthoritativeLiveCatalog,
  requiresPlainStringContent
};
