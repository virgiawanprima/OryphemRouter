// Pollinations anonymous-auth fallback for image requests — ported from
// OmniRoute open-sse/handlers/imageGeneration/pollinationsAnonAuth.ts.
//
// Keyless Pollinations image requests get a fingerprint-pool session (mirror
// of the chat path) so Pollinations' upstream doesn't reject with 401. Uses
// the ported sessionPool service (services/sessionPool/).
import { SessionPool } from "../../services/sessionPool/sessionPool.js";
import { DEFAULT_POOL_CONFIG } from "../../services/sessionPool/types.js";

let pollinationsImagePool = null;

function getPollinationsImagePool() {
  if (!pollinationsImagePool) {
    pollinationsImagePool = new SessionPool("pollinations", DEFAULT_POOL_CONFIG);
    pollinationsImagePool.warmUp(DEFAULT_POOL_CONFIG.minSessions).catch(() => {});
  }
  return pollinationsImagePool;
}

/**
 * When `providerId` is Pollinations and no real key/token is present, acquire
 * a fingerprint-pool session and return its headers merged over `headers`,
 * plus the session so the caller can release it once the upstream call is
 * done. No-op (returns `{ headers, session: null }`) for every other provider
 * or when a real key is configured.
 */
export async function applyPollinationsAnonymousFallback(providerId, token, headers) {
  if (providerId !== "pollinations" || token) {
    return { headers, session: null };
  }

  const pool = getPollinationsImagePool();
  let session = null;
  try {
    session = await pool.acquireBlocking(10_000);
  } catch {
    // Pool exhausted — fall through without fingerprint headers rather than
    // block the request indefinitely.
    session = null;
  }

  if (!session) {
    return { headers, session: null };
  }

  return {
    headers: { ...headers, ...session.buildHeaders() },
    session,
  };
}

/** Report the outcome of an anonymous Pollinations image request back to the pool. */
export function reportPollinationsAnonOutcome(session, status) {
  if (!session || !pollinationsImagePool) return;
  if (status === 429) {
    pollinationsImagePool.reportCooldown(session);
  } else if (typeof status === "number" && status >= 500) {
    pollinationsImagePool.reportDead(session);
  } else {
    pollinationsImagePool.reportSuccess(session);
  }
  session.release();
}

// Helper-module export surface: this is not a standalone image adapter, but it
// stays loadable and exposes the same functions as the OmniRoute module.
export function supportsModel() {
  return false;
}

export function getModels() {
  return [];
}

export default { applyPollinationsAnonymousFallback, reportPollinationsAnonOutcome, supportsModel, getModels };
