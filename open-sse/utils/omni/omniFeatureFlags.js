import { getFeatureFlagOverride } from "./omniDbFeatureFlags.js";
import {
  FEATURE_FLAG_DEFINITIONS
} from "./omniFeatureFlagDefinitions.js";
import { log as engineLog, sanitize } from "../log.js";
function resolveFeatureFlag(key) {
  const dbOverride = getFeatureFlagOverride(key);
  if (dbOverride !== void 0) return dbOverride;
  const envValue = process.env[key];
  if (envValue !== void 0 && envValue !== "") return envValue;
  const definition = FEATURE_FLAG_DEFINITIONS.find((d) => d.key === key);
  return definition?.defaultValue ?? "false";
}
function isFeatureFlagEnabled(key) {
  const value = resolveFeatureFlag(key);
  return value === "true" || value === "1" || value === "yes";
}
function resolveAllFeatureFlags() {
  return FEATURE_FLAG_DEFINITIONS.map((definition) => {
    const dbOverride = getFeatureFlagOverride(definition.key);
    if (dbOverride !== void 0) {
      return { key: definition.key, effectiveValue: dbOverride, source: "db", definition };
    }
    const envValue = process.env[definition.key];
    if (envValue !== void 0 && envValue !== "") {
      return { key: definition.key, effectiveValue: envValue, source: "env", definition };
    }
    return {
      key: definition.key,
      effectiveValue: definition.defaultValue,
      source: "default",
      definition
    };
  });
}
function isRequireApiKeyEnabled() {
  try {
    return isFeatureFlagEnabled("REQUIRE_API_KEY");
  } catch (error) {
    engineLog.error(
      "FEATURE-FLAGS",
      "Failed to resolve REQUIRE_API_KEY, defaulting to required:",
      sanitize(error instanceof Error ? error.message : error)
    );
    return true;
  }
}
function isCcCompatibleProviderEnabled() {
  return isFeatureFlagEnabled("ENABLE_CC_COMPATIBLE_PROVIDER");
}
function areContextWindowChecksDisabled() {
  try {
    return isFeatureFlagEnabled("DISABLE_CONTEXT_WINDOW_CHECKS");
  } catch (error) {
    engineLog.error(
      "FEATURE-FLAGS",
      "Failed to resolve DISABLE_CONTEXT_WINDOW_CHECKS, keeping checks enabled:",
      sanitize(error instanceof Error ? error.message : error)
    );
    return false;
  }
}
function isApiKeyRevealEnabledFlag() {
  try {
    return isFeatureFlagEnabled("ALLOW_API_KEY_REVEAL");
  } catch (error) {
    engineLog.error(
      "FEATURE-FLAGS",
      "Failed to resolve ALLOW_API_KEY_REVEAL, defaulting to disabled:",
      sanitize(error instanceof Error ? error.message : error)
    );
    return false;
  }
}
function isModelCatalogNamesEnabled() {
  return isFeatureFlagEnabled("MODEL_CATALOG_INCLUDE_NAMES");
}
function getModelsCatalogPrefixMode() {
  const value = resolveFeatureFlag("MODELS_CATALOG_PREFIX_MODE");
  if (value === "alias" || value === "canonical") return value;
  return "dual";
}
function isArenaEloSyncEnabled() {
  return isFeatureFlagEnabled("ARENA_ELO_SYNC_ENABLED");
}
function isControlPlaneProxyDirectFallbackEnabled() {
  try {
    return isFeatureFlagEnabled("OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK");
  } catch (error) {
    engineLog.error(
      "FEATURE-FLAGS",
      "Failed to resolve OMNIROUTE_CONTROL_PLANE_PROXY_DIRECT_FALLBACK, defaulting to disabled:",
      sanitize(error instanceof Error ? error.message : error)
    );
    return false;
  }
}
function isNetworkRotationSharedEgressGuardEnabled() {
  try {
    return isFeatureFlagEnabled("NETWORK_ROTATION_SHARED_EGRESS_GUARD");
  } catch (error) {
    engineLog.error(
      "FEATURE-FLAGS",
      "Failed to resolve NETWORK_ROTATION_SHARED_EGRESS_GUARD, defaulting to enabled:",
      sanitize(error instanceof Error ? error.message : error)
    );
    return true;
  }
}
export {
  areContextWindowChecksDisabled,
  getModelsCatalogPrefixMode,
  isApiKeyRevealEnabledFlag,
  isArenaEloSyncEnabled,
  isCcCompatibleProviderEnabled,
  isControlPlaneProxyDirectFallbackEnabled,
  isFeatureFlagEnabled,
  isModelCatalogNamesEnabled,
  isNetworkRotationSharedEgressGuardEnabled,
  isRequireApiKeyEnabled,
  resolveAllFeatureFlags,
  resolveFeatureFlag
};
