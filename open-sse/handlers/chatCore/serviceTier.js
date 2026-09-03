import {
  getCodexRequestDefaults,
  normalizeCodexServiceTier
} from "../../utils/omni/requestDefaults.js";
function resolveEffectiveServiceTier(provider, providerSpecificData, requestBody) {
  if (provider !== "codex") return "standard";
  const requestRecord = requestBody && typeof requestBody === "object" && !Array.isArray(requestBody) ? requestBody : {};
  const rawServiceTier = requestRecord.service_tier;
  if (typeof rawServiceTier === "string" && rawServiceTier.trim().length > 0) {
    const normalizedServiceTier = normalizeCodexServiceTier(rawServiceTier);
    if (normalizedServiceTier) return normalizedServiceTier;
  }
  return getCodexRequestDefaults(providerSpecificData).serviceTier ?? "standard";
}
function resolveReportedServiceTier(provider, payload, maxDepth = 3) {
  if (maxDepth <= 0 || provider !== "codex" || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload;
  const rawServiceTier = record.service_tier;
  if (typeof rawServiceTier === "string" && rawServiceTier.trim().length > 0) {
    const normalizedServiceTier = normalizeCodexServiceTier(rawServiceTier);
    if (normalizedServiceTier) return normalizedServiceTier;
  }
  return resolveReportedServiceTier(provider, record.response, maxDepth - 1);
}
export {
  resolveEffectiveServiceTier,
  resolveReportedServiceTier
};
