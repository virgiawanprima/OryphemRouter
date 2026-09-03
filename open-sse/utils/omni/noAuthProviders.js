// ADAPTED STUB — deep app infra (OmniRoute src/shared/utils/noAuthProviders).
// Backed by the unified provider registry where possible; otherwise graceful defaults.
import { NOAUTH_PROVIDERS } from "./providerRegistry.js";

export function isProviderBlockedByIdOrAlias(_providerId) {
  return false;
}

export function isNoAuthProviderKey(...keys) {
  for (const key of keys) {
    if (!key) continue;
    const normalized = String(key).toLowerCase();
    if (NOAUTH_PROVIDERS[normalized]) return true;
    // provider id with openai-compatible- / prefix etc.
    if (normalized.startsWith("openai-compatible-")) {
      const bare = normalized.slice("openai-compatible-".length);
      if (NOAUTH_PROVIDERS[bare]) return true;
    }
  }
  return false;
}

export function isNoAuthProviderBlocked() {
  return false;
}

export function normalizeBlockedProviderSet(blockedProviders) {
  if (!blockedProviders) return new Set();
  if (blockedProviders instanceof Set) return blockedProviders;
  if (Array.isArray(blockedProviders)) return new Set(blockedProviders.map(String));
  return new Set();
}