// Minimal self-contained adaptation of OmniRoute services/errorClassifier.ts
// for OryphemRouter. Only the geo-block classifier needed by
// antigravityUpstreamError.js is ported.

const GEO_BLOCK_SIGNALS = [
  "user location is not supported",
  "location is not supported",
  "not supported for the api use",
  "region is not supported",
  "unsupported location",
  "not available in your location",
  "not available in your region",
];

export function isGeoBlockedError(errorMessage) {
  const lower = String(errorMessage || "").toLowerCase();
  return GEO_BLOCK_SIGNALS.some((signal) => lower.includes(signal));
}
