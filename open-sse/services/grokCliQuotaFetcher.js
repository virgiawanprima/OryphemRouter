import { registerQuotaFetcher } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
import { decodeGrokCreditsFrame } from "./grokCliQuotaFrame.js";
const GROK_CLI_CONFIG = {
  baseUrl: "https://grok.com",
  billingPath: "/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig"
};
const GRPC_WEB_EMPTY_REQUEST_FRAME = Buffer.from([0, 0, 0, 0, 0]);
const CACHE_TTL_MS = 6e4;
const quotaCache = /* @__PURE__ */ new Map();
const _cacheCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of quotaCache) {
    if (now - entry.fetchedAt > CACHE_TTL_MS * 5) {
      quotaCache.delete(key);
    }
  }
}, 5 * 6e4);
if (typeof _cacheCleanup === "object" && "unref" in _cacheCleanup) {
  _cacheCleanup.unref?.();
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function extractAccessToken(connection) {
  const credentials = toRecord(connection?.credentials);
  return typeof credentials.accessToken === "string" && credentials.accessToken.trim().length > 0 ? credentials.accessToken : null;
}
function buildQuota(percentUsed, resetAt) {
  const clampedPercent = Math.min(100, Math.max(0, percentUsed));
  const fraction = clampedPercent / 100;
  return {
    used: Math.round(clampedPercent),
    total: 100,
    percentUsed: fraction,
    resetAt,
    limitReached: clampedPercent >= 100
  };
}
async function fetchGrokCliQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const accessToken = extractAccessToken(connection);
  if (!accessToken) {
    return null;
  }
  const url = `${GROK_CLI_CONFIG.baseUrl}${GROK_CLI_CONFIG.billingPath}`;
  try {
    await throttleQuotaFetch();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/grpc-web+proto",
        "X-Grpc-Web": "1"
      },
      body: GRPC_WEB_EMPTY_REQUEST_FRAME,
      signal: AbortSignal.timeout(8e3)
    });
    if (response.status === 401 || response.status === 403) {
      quotaCache.delete(connectionId);
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const decoded = decodeGrokCreditsFrame(Buffer.from(arrayBuffer));
    if (!decoded) return null;
    const quota = buildQuota(decoded.percentUsed, decoded.resetAt);
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateGrokCliQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerGrokCliQuotaFetcher() {
  registerQuotaFetcher("grok-cli", fetchGrokCliQuota);
  registerMonitorFetcher("grok-cli", fetchGrokCliQuota);
}
export {
  fetchGrokCliQuota,
  invalidateGrokCliQuotaCache,
  registerGrokCliQuotaFetcher
};
