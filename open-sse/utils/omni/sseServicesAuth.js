// ADAPTED STUB — OmniRoute `src/sse/services/auth.ts` resolves provider
// credentials with a quota preflight check. OryphemRouter resolves
// credentials through its own executors; return null (no credentials found)
// so combo strategies fail with "No credentials" rather than crashing.
export async function getProviderCredentialsWithQuotaPreflight(_provider, _opts = {}) {
  return null;
}

export function clearRecoveredProviderState(_provider) {}
