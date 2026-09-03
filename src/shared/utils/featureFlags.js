// Feature flags — shared util consumed by open-sse ported code (probeOrigin.js)
// and the app. Env-driven (ORYPHEM_* / *_FLAG); defaults to false when unset.
// Keep behavior aligned with open-sse/utils/omni/featureFlags.js.

export function resolveFeatureFlag(key) {
  const envValue = process.env[key];
  if (envValue !== undefined && envValue !== "") return envValue;
  return "false";
}

export function isFeatureFlagEnabled(key) {
  const value = resolveFeatureFlag(key);
  return value === "true" || value === "1" || value === "yes";
}
