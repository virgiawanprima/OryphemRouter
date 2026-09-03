// ADAPTED STUB — minimal port of OmniRoute `src/lib/memory/injection.ts`
// (`systemMessageMustBeFirst` / `resolveProvidersSystemMustBeFirst`), which
// OryphemRouter does not ship (no src/lib/memory/injection module).
//
// Consumed by `open-sse/translator/helpers/strictSystemHoist.js`, which hoists
// every `system`-role message onto index 0 for providers that reject a
// non-first system message. Honors the same `OMNIROUTE_STRICT_SYSTEM_PROVIDERS`
// env override as the OmniRoute source (single source of truth for the
// provider set).

const BUILTIN_PROVIDERS_SYSTEM_MUST_BE_FIRST = new Set([
  "xiaomi-mimo",
  "mimo",
  "tokenrouter"
]);

function parseStrictSystemProvidersEnv(env = process.env) {
  const raw = env.OMNIROUTE_STRICT_SYSTEM_PROVIDERS ?? "";
  return raw
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

function resolveProvidersSystemMustBeFirst(env = process.env) {
  const extra = parseStrictSystemProvidersEnv(env);
  if (extra.length === 0) return BUILTIN_PROVIDERS_SYSTEM_MUST_BE_FIRST;
  return new Set([...BUILTIN_PROVIDERS_SYSTEM_MUST_BE_FIRST, ...extra]);
}

export function systemMessageMustBeFirst(provider, env = process.env) {
  if (!provider) return false;
  const normalized = provider.toLowerCase().trim();
  return resolveProvidersSystemMustBeFirst(env).has(normalized);
}

export { BUILTIN_PROVIDERS_SYSTEM_MUST_BE_FIRST, parseStrictSystemProvidersEnv };
