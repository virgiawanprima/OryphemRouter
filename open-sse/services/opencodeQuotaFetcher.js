import { registerQuotaFetcher, registerQuotaWindows } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
import { resolveOpenCodeGoDashboardConfig } from "./opencodeOllamaUsage.js";
import { log } from "../utils/log.js";
const OPENCODE_QUOTA_URL = process.env.OMNIROUTE_OPENCODE_QUOTA_URL ?? "https://opencode.ai/zen/go/v1/quota";
const CACHE_TTL_MS = 6e4;
const NO_ENDPOINT_TTL_MS = 5 * 6e4;
const OPENCODE_WINDOW_5H = "window_5h";
const OPENCODE_WINDOW_WEEKLY = "window_weekly";
const OPENCODE_WINDOW_MONTHLY = "window_monthly";
const quotaCache = /* @__PURE__ */ new Map();
const _warned404Urls = /* @__PURE__ */ new Set();
function _resetWarned404Urls() {
  _warned404Urls.clear();
}
function _hasWarned404(url) {
  return _warned404Urls.has(url);
}
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
function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function parseWindowResetAt(window) {
  const resetAt = toNumber(window["reset_at"] ?? window["resetAt"], 0);
  if (resetAt > 0) {
    return new Date(resetAt < 1e12 ? resetAt * 1e3 : resetAt).toISOString();
  }
  const resetAfterSeconds = toNumber(
    window["reset_after_seconds"] ?? window["resetAfterSeconds"],
    0
  );
  if (resetAfterSeconds > 0) {
    return new Date(Date.now() + resetAfterSeconds * 1e3).toISOString();
  }
  return null;
}
function parseWindowPercent(window) {
  const used = toNumber(window["used"] ?? window["used_amount"], 0);
  const limit = toNumber(window["limit"] ?? window["limit_amount"], 0);
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(1, used / limit));
}
function parseOpencodeQuotaResponse(data) {
  const obj = toRecord(data);
  const quotaObj = toRecord(obj["quota"] ?? obj["data"] ?? obj["usage"]);
  const w5h = toRecord(
    quotaObj[OPENCODE_WINDOW_5H] ?? quotaObj["5h"] ?? quotaObj["hourly"] ?? quotaObj["short"]
  );
  const wWeekly = toRecord(
    quotaObj[OPENCODE_WINDOW_WEEKLY] ?? quotaObj["weekly"] ?? quotaObj["week"] ?? quotaObj["wk"]
  );
  const wMonthly = toRecord(
    quotaObj[OPENCODE_WINDOW_MONTHLY] ?? quotaObj["monthly"] ?? quotaObj["month"] ?? quotaObj["mo"]
  );
  const has5h = Object.keys(w5h).length > 0;
  const hasWeekly = Object.keys(wWeekly).length > 0;
  const hasMonthly = Object.keys(wMonthly).length > 0;
  if (!has5h && !hasWeekly && !hasMonthly) return null;
  const percent5h = has5h ? parseWindowPercent(w5h) : 0;
  const percentWeekly = hasWeekly ? parseWindowPercent(wWeekly) : 0;
  const percentMonthly = hasMonthly ? parseWindowPercent(wMonthly) : 0;
  const resetAt5h = has5h ? parseWindowResetAt(w5h) : null;
  const resetAtWeekly = hasWeekly ? parseWindowResetAt(wWeekly) : null;
  const resetAtMonthly = hasMonthly ? parseWindowResetAt(wMonthly) : null;
  const worstPercent = Math.max(percent5h, percentWeekly, percentMonthly);
  const limitReached = Boolean(obj["limit_reached"] ?? quotaObj["limit_reached"]) || worstPercent >= 1;
  let dominantResetAt = null;
  if (worstPercent === percent5h) {
    dominantResetAt = resetAt5h ?? resetAtWeekly ?? resetAtMonthly;
  } else if (worstPercent === percentWeekly) {
    dominantResetAt = resetAtWeekly ?? resetAt5h ?? resetAtMonthly;
  } else {
    dominantResetAt = resetAtMonthly ?? resetAtWeekly ?? resetAt5h;
  }
  const window5h = { percentUsed: percent5h, resetAt: resetAt5h };
  const windowWeekly = { percentUsed: percentWeekly, resetAt: resetAtWeekly };
  const windowMonthly = { percentUsed: percentMonthly, resetAt: resetAtMonthly };
  const windows = {};
  if (has5h) windows[OPENCODE_WINDOW_5H] = window5h;
  if (hasWeekly) windows[OPENCODE_WINDOW_WEEKLY] = windowWeekly;
  if (hasMonthly) windows[OPENCODE_WINDOW_MONTHLY] = windowMonthly;
  return {
    used: worstPercent * 100,
    total: 100,
    percentUsed: worstPercent,
    resetAt: dominantResetAt,
    windows,
    window5h,
    windowWeekly,
    windowMonthly,
    limitReached
  };
}
const DASHBOARD_SNAPSHOT_WINDOW_MAP = [
  ["session", OPENCODE_WINDOW_5H],
  ["weekly", OPENCODE_WINDOW_WEEKLY],
  ["mcp_monthly", OPENCODE_WINDOW_MONTHLY]
];
function hasDashboardQuotaConfig(connection) {
  const psd = connection?.providerSpecificData;
  return resolveOpenCodeGoDashboardConfig(psd).state !== "none";
}
async function synthesizeQuotaFromDashboardSnapshots(connectionId) {
  let quotaCacheDomain;
  try {
    quotaCacheDomain = await import("../utils/omni/quotaCache.js");
  } catch {
    return null;
  }
  quotaCacheDomain.getQuotaWindowStatus(connectionId, DASHBOARD_SNAPSHOT_WINDOW_MAP[0][0]);
  const entry = quotaCacheDomain.getQuotaCache(connectionId);
  const quotas = entry?.quotas;
  if (!quotas || typeof quotas !== "object") return null;
  const now = Date.now();
  const windows = {};
  for (const [snapshotKey, windowKey] of DASHBOARD_SNAPSHOT_WINDOW_MAP) {
    const raw = quotas[snapshotKey];
    if (!raw || typeof raw.remainingPercentage !== "number") continue;
    if (raw.fractionReported === false) continue;
    const resetAt = typeof raw.resetAt === "string" && raw.resetAt ? raw.resetAt : null;
    if (resetAt) {
      const resetMs = Date.parse(resetAt);
      if (Number.isFinite(resetMs) && resetMs <= now) continue;
    }
    const remaining = Math.max(0, Math.min(100, raw.remainingPercentage));
    windows[windowKey] = { percentUsed: 1 - remaining / 100, resetAt };
  }
  if (Object.keys(windows).length === 0) return null;
  const window5h = windows[OPENCODE_WINDOW_5H] ?? { percentUsed: 0, resetAt: null };
  const windowWeekly = windows[OPENCODE_WINDOW_WEEKLY] ?? { percentUsed: 0, resetAt: null };
  const windowMonthly = windows[OPENCODE_WINDOW_MONTHLY] ?? { percentUsed: 0, resetAt: null };
  const worstPercent = Math.max(
    window5h.percentUsed,
    windowWeekly.percentUsed,
    windowMonthly.percentUsed
  );
  let dominantResetAt = null;
  if (worstPercent === window5h.percentUsed) {
    dominantResetAt = window5h.resetAt ?? windowWeekly.resetAt ?? windowMonthly.resetAt;
  } else if (worstPercent === windowWeekly.percentUsed) {
    dominantResetAt = windowWeekly.resetAt ?? window5h.resetAt ?? windowMonthly.resetAt;
  } else {
    dominantResetAt = windowMonthly.resetAt ?? windowWeekly.resetAt ?? window5h.resetAt;
  }
  return {
    used: worstPercent * 100,
    total: 100,
    percentUsed: worstPercent,
    resetAt: dominantResetAt,
    windows,
    window5h,
    windowWeekly,
    windowMonthly,
    limitReached: worstPercent >= 1
  };
}
async function fetchOpencodeQuota(connectionId, connection) {
  const dashboardConfigured = hasDashboardQuotaConfig(connection);
  const cached = quotaCache.get(connectionId);
  if (cached) {
    if (cached.noEndpoint && Date.now() - cached.fetchedAt < NO_ENDPOINT_TTL_MS) {
      return dashboardConfigured ? synthesizeQuotaFromDashboardSnapshots(connectionId) : null;
    }
    if (cached.quota !== null && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.quota;
    }
  }
  const live = await fetchLiveOpencodeQuota(connectionId, connection);
  if (live) return live;
  return dashboardConfigured ? synthesizeQuotaFromDashboardSnapshots(connectionId) : null;
}
async function fetchLiveOpencodeQuota(connectionId, connection) {
  const apiKey = typeof connection?.apiKey === "string" && connection.apiKey.trim().length > 0 ? connection.apiKey : null;
  if (!apiKey) {
    return null;
  }
  try {
    await throttleQuotaFetch();
    const response = await fetch(OPENCODE_QUOTA_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8e3)
    });
    if (!response.ok) {
      if (response.status === 404) {
        if (!_warned404Urls.has(OPENCODE_QUOTA_URL)) {
          _warned404Urls.add(OPENCODE_QUOTA_URL);
          log.warn(
            "OPENCODE-QUOTA",
            `[opencodeQuotaFetcher] ${OPENCODE_QUOTA_URL} returned 404 \u2014 opencode-go usage API is not yet public. Set OMNIROUTE_OPENCODE_QUOTA_URL to a working endpoint, or follow https://github.com/anomalyco/opencode/issues/16017 for upstream status.`
          );
        }
        quotaCache.set(connectionId, {
          quota: null,
          fetchedAt: Date.now(),
          noEndpoint: true
        });
        return null;
      }
      if (response.status === 401 || response.status === 403) {
        quotaCache.delete(connectionId);
      }
      return null;
    }
    let data;
    try {
      data = await response.json();
    } catch {
      return null;
    }
    const quota = parseOpencodeQuotaResponse(data);
    if (!quota) return null;
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateOpencodeQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerOpencodeQuotaFetcher() {
  for (const provider of ["opencode-go", "opencode", "opencode-zen"]) {
    registerQuotaFetcher(provider, fetchOpencodeQuota);
    registerMonitorFetcher(provider, fetchOpencodeQuota);
    registerQuotaWindows(provider, [
      OPENCODE_WINDOW_5H,
      OPENCODE_WINDOW_WEEKLY,
      OPENCODE_WINDOW_MONTHLY
    ]);
  }
}
export {
  OPENCODE_WINDOW_5H,
  OPENCODE_WINDOW_MONTHLY,
  OPENCODE_WINDOW_WEEKLY,
  _hasWarned404,
  _resetWarned404Urls,
  fetchOpencodeQuota,
  invalidateOpencodeQuotaCache,
  registerOpencodeQuotaFetcher
};
