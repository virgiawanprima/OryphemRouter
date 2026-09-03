import { detectCachingContext, getCacheAwareStrategy } from "./cachingAware.js";
import {
  normalizePreserveSystemPromptMode,
  resolvePreserveSystemPrompt
} from "./preserveSystemPromptMode.js";
import {
  resolvePrefixFreezeConfig,
  extractStablePrefixHash,
  observePrefix,
  isPrefixFrozen
} from "./prefixFreeze.js";
function observeAndCheckPrefixFreeze(body) {
  const cfg = resolvePrefixFreezeConfig();
  if (!cfg.enabled) return false;
  const hash = extractStablePrefixHash(body);
  if (!hash) return false;
  observePrefix(hash);
  return isPrefixFrozen(hash, cfg.threshold);
}
function resolveCacheAwareConfig(config, body, context) {
  const mode = normalizePreserveSystemPromptMode(config);
  const staticCache = body ? getCacheAwareStrategy(config.defaultMode, detectCachingContext(body, context)).skipSystemPrompt : false;
  const hasCache = staticCache || (body ? observeAndCheckPrefixFreeze(body) : false);
  const effective = resolvePreserveSystemPrompt(mode, { hasCache });
  if (effective === config.preserveSystemPrompt) return config;
  return { ...config, preserveSystemPrompt: effective };
}
export {
  resolveCacheAwareConfig
};
