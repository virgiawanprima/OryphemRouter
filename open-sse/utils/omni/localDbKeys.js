// ADAPTED STUB — OmniRoute `src/lib/localDb.ts` exposes API-key model access
// checks and key-group lookups. OryphemRouter enforces key access elsewhere;
// permissive fallbacks keep keyGroupAuth / tokenLimitCounter loadable.
export function checkKeyModelAccess(_apiKey, _model, _opts = {}) {
  return { allowed: true, reason: null };
}

export async function getKeyGroupsForApiKey(_apiKey) {
  return [];
}
