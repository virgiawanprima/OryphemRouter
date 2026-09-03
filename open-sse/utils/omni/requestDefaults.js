// ADAPTED STUB — ported from OmniRoute src/lib/providers/requestDefaults.ts
// Only `isOpenAIResponsesStoreEnabled` is needed (by responsesStatePolicy.js).

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function isOpenAIResponsesStoreEnabled(providerSpecificData) {
  return asRecord(providerSpecificData).openaiStoreEnabled === true;
}

// Added for mcp-server/catalog.ts port.
export function getCodexRequestDefaults(_providerSpecificData) {
  return {};
}

// Added for chatCore/serviceTier.ts port.
export function normalizeCodexServiceTier(value) {
  if (value === "default" || value === "priority" || value === "flex") return value;
  return undefined;
}
