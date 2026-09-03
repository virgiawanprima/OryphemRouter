// ADAPTED STUB — deep app infra (OmniRoute src/lib/memory/settings.ts).
export const DEFAULT_MEMORY_SETTINGS = {
  enabled: false,
  k: 4,
  threshold: 0.5,
  maxTokens: 0,
  skillsEnabled: false,
};
export async function getMemorySettings(_apiKeyId) {
  return { ...DEFAULT_MEMORY_SETTINGS };
}
export function toMemoryRetrievalConfig(_settings, _opts) {
  return { k: 4, threshold: 0.5 };
}
