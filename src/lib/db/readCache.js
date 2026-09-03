// readCache — cached settings reads for app + ported open-sse code
// (probeOrigin.js imports getCachedSettings from here).
//
// Wraps the settings repo with a small TTL cache and subscribes to the live
// "push" event so dashboard writes invalidate the cache immediately.

import { getSettings } from "./repos/settingsRepo.js";

const TTL_MS = 5000;
let cache = null;
let cacheAt = 0;

// Invalidate on any live push (settings update broadcasts to the stats emitter).
global._statsEmitter?.on?.("push", () => { cache = null; cacheAt = 0; });

export async function getCachedSettings() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  try {
    const settings = await getSettings();
    cache = settings;
    cacheAt = now;
    return settings;
  } catch {
    return {};
  }
}

export async function getCombosCacheVersion() {
  const settings = await getCachedSettings();
  return settings?.combosCacheVersion ?? 0;
}
