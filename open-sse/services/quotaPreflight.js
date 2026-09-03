import { isCompatibleProviderConnectionId } from "../utils/omni/omniCompatibleProviderId.js";
import { isFeatureFlagEnabled } from "../utils/omni/omniFeatureFlags.js";
import { fetchNewApiAggregatorQuota } from "./newApiAggregatorQuotaFetcher.js";
import { log } from "../utils/log.js";
const quotaWindowsRegistry = /* @__PURE__ */ new Map();
function registerQuotaWindows(provider, windows) {
  quotaWindowsRegistry.set(provider, [...windows]);
}
function getQuotaWindows(provider) {
  return quotaWindowsRegistry.get(provider) || quotaWindowsRegistry.get(provider.toLowerCase()) || [];
}
function getAllProviderQuotaWindows() {
  return Object.fromEntries(quotaWindowsRegistry);
}
const DEFAULT_MIN_REMAINING_PERCENT = 2;
const DEFAULT_WARN_REMAINING_PERCENT = 20;
const REMAINING_PERCENT_EPSILON = 1e-9;
const quotaFetcherRegistry = /* @__PURE__ */ new Map();
function registerQuotaFetcher(provider, fetcher) {
  quotaFetcherRegistry.set(provider, fetcher);
}
function getQuotaFetcher(provider) {
  return quotaFetcherRegistry.get(provider) || quotaFetcherRegistry.get(provider.toLowerCase());
}
function isQuotaPreflightEnabled(connection) {
  const psd = connection?.providerSpecificData;
  return psd?.quotaPreflightEnabled === true;
}
function resolveOrDefault(resolver, window, fallbackPercent) {
  if (!resolver) return fallbackPercent;
  const raw = resolver(window);
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100) {
    return raw;
  }
  return fallbackPercent;
}
function remainingPercentFrom(percentUsed) {
  return Math.max(0, (1 - percentUsed) * 100);
}
function isRemainingAtOrBelowThreshold(remainingPercent, thresholdPercent) {
  return remainingPercent <= thresholdPercent + REMAINING_PERCENT_EPSILON;
}
function exhaustedResult(quotaPercent, resetAt) {
  return {
    proceed: false,
    reason: "quota_exhausted",
    quotaPercent,
    resetAt
  };
}
function limitReachedResult(quota) {
  return exhaustedResult(
    Number.isFinite(quota.percentUsed) ? quota.percentUsed : 1,
    quota.resetAt ?? null
  );
}
function quotaWindowCutoffResult(windows, thresholds) {
  let worstUsedPercent = 0;
  let worstWindow = null;
  let worstResetAt = null;
  for (const [windowName, windowInfo] of Object.entries(windows)) {
    if (!Number.isFinite(windowInfo.percentUsed)) continue;
    const minRemainingPercent = resolveOrDefault(
      thresholds?.resolveMinRemainingPercent,
      windowName,
      DEFAULT_MIN_REMAINING_PERCENT
    );
    if (!isRemainingAtOrBelowThreshold(
      remainingPercentFrom(windowInfo.percentUsed),
      minRemainingPercent
    )) {
      continue;
    }
    if (windowInfo.percentUsed <= worstUsedPercent && worstWindow !== null) continue;
    worstUsedPercent = windowInfo.percentUsed;
    worstWindow = windowName;
    worstResetAt = windowInfo.resetAt ?? null;
  }
  return worstWindow === null ? null : exhaustedResult(worstUsedPercent, worstResetAt);
}
function quotaPercentCutoffResult(quota, thresholds) {
  if (!Number.isFinite(quota.percentUsed)) return { proceed: true };
  const minRemainingPercent = resolveOrDefault(
    thresholds?.resolveMinRemainingPercent,
    null,
    DEFAULT_MIN_REMAINING_PERCENT
  );
  const remainingPercent = remainingPercentFrom(quota.percentUsed);
  return isRemainingAtOrBelowThreshold(remainingPercent, minRemainingPercent) ? exhaustedResult(quota.percentUsed, quota.resetAt ?? null) : { proceed: true, quotaPercent: quota.percentUsed };
}
function evaluateQuotaCutoff(quota, thresholds) {
  if (!quota) return { proceed: true };
  if (quota.limitReached === true) return limitReachedResult(quota);
  const windows = quota.windows;
  if (windows && Object.keys(windows).length > 0) {
    return quotaWindowCutoffResult(windows, thresholds) ?? {
      proceed: true,
      quotaPercent: quota.percentUsed
    };
  }
  return quotaPercentCutoffResult(quota, thresholds);
}
function resolveDynamicQuotaFetcher(provider, connection) {
  if (!isCompatibleProviderConnectionId(provider)) return void 0;
  const psd = connection?.providerSpecificData;
  if (!psd || psd.newApiAggregatorBalance !== true) return void 0;
  if (!isFeatureFlagEnabled("NEWAPI_AGGREGATOR_BALANCE")) return void 0;
  return fetchNewApiAggregatorQuota;
}
async function preflightQuota(provider, connectionId, connection, thresholds) {
  let fetcher = getQuotaFetcher(provider);
  if (!fetcher) {
    fetcher = resolveDynamicQuotaFetcher(provider, connection);
    if (!fetcher) {
      return { proceed: true };
    }
  }
  let quota = null;
  try {
    quota = await fetcher(connectionId, connection);
  } catch {
    return { proceed: true };
  }
  if (!quota) {
    return { proceed: true };
  }
  if (quota.limitReached === true) {
    return limitReachedResult(quota);
  }
  if (quota.windows && Object.keys(quota.windows).length > 0) {
    let worstUsedPercent = 0;
    let worstWindow = null;
    let worstResetAt = null;
    for (const [windowName, windowInfo] of Object.entries(quota.windows)) {
      const minRemainingPercent2 = resolveOrDefault(
        thresholds?.resolveMinRemainingPercent,
        windowName,
        DEFAULT_MIN_REMAINING_PERCENT
      );
      const warnRemainingPercent2 = resolveOrDefault(
        thresholds?.resolveWarnRemainingPercent,
        windowName,
        DEFAULT_WARN_REMAINING_PERCENT
      );
      const remainingPercent2 = remainingPercentFrom(windowInfo.percentUsed);
      if (isRemainingAtOrBelowThreshold(remainingPercent2, minRemainingPercent2)) {
        if (windowInfo.percentUsed > worstUsedPercent) {
          worstUsedPercent = windowInfo.percentUsed;
          worstWindow = windowName;
          worstResetAt = windowInfo.resetAt ?? null;
        } else if (worstWindow === null) {
          worstWindow = windowName;
          worstResetAt = windowInfo.resetAt ?? null;
        }
      } else if (isRemainingAtOrBelowThreshold(remainingPercent2, warnRemainingPercent2)) {
        log.warn(
          "QUOTA-PREFLIGHT",
          `[QuotaPreflight] ${provider}/${connectionId} ${windowName}: ${remainingPercent2.toFixed(1)}% remaining \u2014 approaching cutoff`
        );
      }
    }
    if (worstWindow !== null) {
      const worstRemaining = remainingPercentFrom(worstUsedPercent);
      log.info(
        "QUOTA-PREFLIGHT",
        `[QuotaPreflight] ${provider}/${connectionId} ${worstWindow}: ${worstRemaining.toFixed(1)}% remaining \u2014 switching`
      );
      return {
        proceed: false,
        reason: "quota_exhausted",
        quotaPercent: worstUsedPercent,
        resetAt: worstResetAt
      };
    }
    return { proceed: true, quotaPercent: quota.percentUsed };
  }
  const minRemainingPercent = resolveOrDefault(
    thresholds?.resolveMinRemainingPercent,
    null,
    DEFAULT_MIN_REMAINING_PERCENT
  );
  const warnRemainingPercent = resolveOrDefault(
    thresholds?.resolveWarnRemainingPercent,
    null,
    DEFAULT_WARN_REMAINING_PERCENT
  );
  const { percentUsed } = quota;
  const remainingPercent = remainingPercentFrom(percentUsed);
  if (isRemainingAtOrBelowThreshold(remainingPercent, minRemainingPercent)) {
    log.info(
      "QUOTA-PREFLIGHT",
      `[QuotaPreflight] ${provider}/${connectionId}: ${remainingPercent.toFixed(1)}% remaining \u2014 switching (cutoff ${minRemainingPercent}%)`
    );
    return {
      proceed: false,
      reason: "quota_exhausted",
      quotaPercent: percentUsed,
      resetAt: quota.resetAt ?? null
    };
  }
  if (isRemainingAtOrBelowThreshold(remainingPercent, warnRemainingPercent)) {
    log.warn(
      "QUOTA-PREFLIGHT",
      `[QuotaPreflight] ${provider}/${connectionId}: ${remainingPercent.toFixed(1)}% remaining \u2014 approaching cutoff`
    );
  }
  return { proceed: true, quotaPercent: percentUsed };
}
export {
  evaluateQuotaCutoff,
  getAllProviderQuotaWindows,
  getQuotaFetcher,
  getQuotaWindows,
  isQuotaPreflightEnabled,
  preflightQuota,
  registerQuotaFetcher,
  registerQuotaWindows,
  resolveDynamicQuotaFetcher
};
