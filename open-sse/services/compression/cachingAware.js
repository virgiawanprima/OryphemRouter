import {
  providerSupportsCaching
} from "../../utils/cacheControlPolicy.js";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function inferProviderFromModel(model) {
  const normalized = normalizeString(model);
  if (!normalized) return null;
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) return null;
  return normalized.slice(0, slashIndex).toLowerCase();
}
function hasOwnCacheControl(value) {
  return isRecord(value) && value.cache_control !== void 0 && value.cache_control !== null;
}
function arrayHasCacheControl(values) {
  return Array.isArray(values) && values.some((value) => hasCacheControl(value));
}
function hasCacheControl(value) {
  if (hasOwnCacheControl(value)) return true;
  if (Array.isArray(value)) return value.some((item) => hasCacheControl(item));
  if (!isRecord(value)) return false;
  if (arrayHasCacheControl(value.system)) return true;
  if (arrayHasCacheControl(value.tools)) return true;
  if (arrayHasCacheControl(value.messages)) return true;
  if (arrayHasCacheControl(value.input)) return true;
  if (arrayHasCacheControl(value.contents)) return true;
  if (isRecord(value.request) && arrayHasCacheControl(value.request.contents)) return true;
  if (isRecord(value.content) || Array.isArray(value.content)) {
    return hasCacheControl(value.content);
  }
  return false;
}
function detectCachingContext(body, context = {}) {
  const bodyRecord = isRecord(body) ? body : {};
  const provider = normalizeString(context.provider)?.toLowerCase() ?? inferProviderFromModel(context.model) ?? inferProviderFromModel(bodyRecord.model);
  const targetFormat = normalizeString(context.targetFormat)?.toLowerCase() ?? null;
  return {
    hasCacheControl: hasCacheControl(body),
    provider,
    targetFormat,
    isCachingProvider: providerSupportsCaching(provider, targetFormat, context.connectionCacheOverride)
  };
}
function getCacheAwareStrategy(strategy, ctx) {
  if (ctx.isCachingProvider) {
    return {
      strategy: ["aggressive", "ultra"].includes(strategy) ? "standard" : strategy,
      skipSystemPrompt: true,
      deterministicOnly: true
    };
  }
  return {
    strategy,
    skipSystemPrompt: false,
    deterministicOnly: false
  };
}
export {
  detectCachingContext,
  getCacheAwareStrategy
};
