// tierConfig — app-side tier configuration provider for the ported tierResolver.
//
// setTierConfig() in tierResolver.js calls loadTierConfig() SYNCHRONOUSLY, so
// this module must not hit the async DB adapter. It returns the ported
// DEFAULT_TIER_CONFIG (the source of truth for tier classification). A
// settings-driven override can be layered on later via mergeTierConfig().

import { DEFAULT_TIER_CONFIG, mergeTierConfig } from "open-sse/services/tierConfig.js";

/**
 * Load the effective tier configuration.
 * Synchronous by contract (consumed by tierResolver's sync setTierConfig).
 * Never throws — returns the ported defaults on any failure.
 * @returns {object}
 */
export function loadTierConfig() {
  try {
    // Tier overrides are not yet persisted in settings; the ported defaults
    // are authoritative. Kept behind mergeTierConfig so a future settings
    // field slots in without changing the call contract.
    return mergeTierConfig(null);
  } catch {
    return DEFAULT_TIER_CONFIG;
  }
}
