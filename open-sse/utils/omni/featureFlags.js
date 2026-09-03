// ADAPTED STUB — ported from OmniRoute src/shared/utils/featureFlags.ts
// Only `isFeatureFlagEnabled` is needed (by proxyFallback.js). Env-driven only;
// the DB override store is not ported. Defaults to false when unset.
export function resolveFeatureFlag(key) {
  const envValue = process.env[key];
  if (envValue !== undefined && envValue !== "") return envValue;
  return "false";
}

export function isFeatureFlagEnabled(key) {
  const value = resolveFeatureFlag(key);
  return value === "true" || value === "1" || value === "yes";
}
