import {
  CODEX_SPARK_DISPLAY_NAME,
  CODEX_SPARK_QUOTA_SESSION,
  CODEX_SPARK_QUOTA_WEEKLY,
  isCodexSparkLimitDescriptor
} from "../utils/omni/codexQuotaScopes.js";
function getFieldValue(record, ...keys) {
  if (!record || typeof record !== "object") return null;
  const typed = record;
  for (const key of keys) {
    if (typed[key] !== void 0 && typed[key] !== null) return typed[key];
  }
  return null;
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
function toNullableNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function parseResetTime(resetValue) {
  if (!resetValue) return null;
  try {
    let date = null;
    if (resetValue instanceof Date) {
      date = resetValue;
    } else if (typeof resetValue === "number") {
      date = new Date(resetValue < 1e12 ? resetValue * 1e3 : resetValue);
    } else if (typeof resetValue === "string") {
      if (/^\d+$/.test(resetValue)) {
        const ts = Number(resetValue);
        date = new Date(ts < 1e12 ? ts * 1e3 : ts);
      } else {
        date = new Date(resetValue);
      }
    }
    if (!date || date.getTime() <= 0) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
function parseWindowReset(window) {
  const resetAt = toNumber(getFieldValue(window, "reset_at", "resetAt"), 0);
  const resetAfterSeconds = toNumber(
    getFieldValue(window, "reset_after_seconds", "resetAfterSeconds"),
    0
  );
  if (resetAt > 0) return parseResetTime(resetAt * 1e3);
  if (resetAfterSeconds > 0) return parseResetTime(Date.now() + resetAfterSeconds * 1e3);
  return null;
}
function buildPercentageQuota(window, displayName) {
  const usedPercent = toNumber(getFieldValue(window, "used_percent", "usedPercent"), 0);
  return {
    used: usedPercent,
    total: 100,
    remaining: 100 - usedPercent,
    resetAt: parseWindowReset(window),
    unlimited: false,
    windowSeconds: toNullableNumber(
      getFieldValue(
        window,
        "limit_window_seconds",
        "limitWindowSeconds",
        "window_seconds",
        "windowSeconds"
      )
    ),
    ...displayName ? { displayName } : {}
  };
}
const WEEKLY_MIN_WINDOW_SECONDS = 6 * 24 * 3600;
const SESSION_MAX_WINDOW_SECONDS = 6 * 3600;
function isLatentWindow(window) {
  const usedPercent = toNumber(getFieldValue(window, "used_percent", "usedPercent"), NaN);
  const limitWindow = toNumber(
    getFieldValue(window, "limit_window_seconds", "limitWindowSeconds"),
    0
  );
  const resetAfter = toNumber(getFieldValue(window, "reset_after_seconds", "resetAfterSeconds"), 0);
  return usedPercent === 0 && limitWindow > 0 && resetAfter >= limitWindow;
}
function windowDurationLabel(window) {
  const limitWindow = toNumber(
    getFieldValue(window, "limit_window_seconds", "limitWindowSeconds"),
    0
  );
  if (limitWindow <= 0) return void 0;
  if (limitWindow >= WEEKLY_MIN_WINDOW_SECONDS) return "Weekly";
  if (limitWindow <= SESSION_MAX_WINDOW_SECONDS) return "Session";
  return void 0;
}
function findCodexSparkRateLimit(data) {
  const additionalRateLimits = getFieldValue(
    data,
    "additional_rate_limits",
    "additionalRateLimits"
  );
  if (!Array.isArray(additionalRateLimits)) return { rateLimit: {} };
  for (const entryValue of additionalRateLimits) {
    const entry = toRecord(entryValue);
    if (isCodexSparkLimitDescriptor(
      getFieldValue(entry, "limit_name", "limitName"),
      getFieldValue(entry, "metered_feature", "meteredFeature"),
      getFieldValue(entry, "limit_id", "limitId"),
      entry["id"],
      entry["name"],
      entry["title"],
      entry["model"],
      getFieldValue(entry, "model_id", "modelId")
    )) {
      const rawLimitName = getFieldValue(entry, "limit_name", "limitName");
      const limitName = typeof rawLimitName === "string" && rawLimitName.trim().length > 0 ? rawLimitName.trim() : void 0;
      return {
        rateLimit: toRecord(getFieldValue(entry, "rate_limit", "rateLimit")),
        ...limitName ? { limitName } : {}
      };
    }
  }
  return { rateLimit: {} };
}
function isCodexReviewLimitDescriptor(...values) {
  return values.some((value) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return normalized === "code_review" || normalized === "codex_review" || normalized === "review" || normalized.includes("code_review") || normalized.includes("codex_review") || normalized.includes("code review");
  });
}
function findCodexReviewRateLimit(data) {
  const additionalRateLimits = getFieldValue(
    data,
    "additional_rate_limits",
    "additionalRateLimits"
  );
  if (!Array.isArray(additionalRateLimits)) return {};
  for (const entryValue of additionalRateLimits) {
    const entry = toRecord(entryValue);
    if (isCodexReviewLimitDescriptor(
      getFieldValue(entry, "limit_name", "limitName"),
      getFieldValue(entry, "metered_feature", "meteredFeature"),
      getFieldValue(entry, "limit_id", "limitId"),
      entry["id"],
      entry["name"]
    )) {
      return toRecord(getFieldValue(entry, "rate_limit", "rateLimit"));
    }
  }
  return {};
}
function parseBankedResetCredits(data) {
  const resetCredits = toRecord(
    getFieldValue(data, "rate_limit_reset_credits", "rateLimitResetCredits")
  );
  const availableCount = getFieldValue(resetCredits, "available_count", "availableCount");
  const count = toNumber(availableCount, NaN);
  return Number.isFinite(count) ? count : void 0;
}
function parseRateLimitReachedType(data) {
  const reachedType = getFieldValue(data, "rate_limit_reached_type", "rateLimitReachedType");
  if (typeof reachedType === "string" && reachedType.trim().length > 0) return reachedType.trim();
  const reachedTypeObj = toRecord(reachedType);
  const type = getFieldValue(reachedTypeObj, "type");
  return typeof type === "string" && type.trim().length > 0 ? type.trim() : void 0;
}
function buildCodexUsageQuotas(dataValue) {
  const data = toRecord(dataValue);
  const rateLimit = toRecord(getFieldValue(data, "rate_limit", "rateLimit"));
  const quotas = {};
  const bankedResetCredits = parseBankedResetCredits(data);
  const rateLimitReachedType = parseRateLimitReachedType(data);
  const primaryWindow = toRecord(getFieldValue(rateLimit, "primary_window", "primaryWindow"));
  if (Object.keys(primaryWindow).length > 0) {
    const primaryLabel = windowDurationLabel(primaryWindow);
    quotas.session = buildPercentageQuota(
      primaryWindow,
      primaryLabel === "Weekly" ? primaryLabel : void 0
    );
  }
  const secondaryWindow = toRecord(getFieldValue(rateLimit, "secondary_window", "secondaryWindow"));
  if (Object.keys(secondaryWindow).length > 0) {
    const secondaryLabel = windowDurationLabel(secondaryWindow);
    quotas.weekly = buildPercentageQuota(
      secondaryWindow,
      secondaryLabel === "Session" ? secondaryLabel : void 0
    );
  }
  const dedicatedReviewRateLimit = toRecord(
    getFieldValue(data, "code_review_rate_limit", "codeReviewRateLimit")
  );
  const reviewRateLimit = Object.keys(dedicatedReviewRateLimit).length > 0 ? dedicatedReviewRateLimit : findCodexReviewRateLimit(data);
  const codeReviewWindow = toRecord(
    getFieldValue(reviewRateLimit, "primary_window", "primaryWindow")
  );
  if (getFieldValue(codeReviewWindow, "used_percent", "usedPercent") !== null || getFieldValue(codeReviewWindow, "remaining_count", "remainingCount") !== null) {
    quotas.code_review = buildPercentageQuota(codeReviewWindow);
  }
  const codeReviewSecondaryWindow = toRecord(
    getFieldValue(reviewRateLimit, "secondary_window", "secondaryWindow")
  );
  if (getFieldValue(codeReviewSecondaryWindow, "used_percent", "usedPercent") !== null || getFieldValue(codeReviewSecondaryWindow, "remaining_count", "remainingCount") !== null) {
    quotas.code_review_weekly = buildPercentageQuota(codeReviewSecondaryWindow);
  }
  const spark = findCodexSparkRateLimit(data);
  const sparkRateLimit = spark.rateLimit;
  const sparkDisplayName = spark.limitName || CODEX_SPARK_DISPLAY_NAME;
  const sparkPrimaryWindow = toRecord(
    getFieldValue(sparkRateLimit, "primary_window", "primaryWindow")
  );
  if (Object.keys(sparkPrimaryWindow).length > 0 && !isLatentWindow(sparkPrimaryWindow)) {
    quotas[CODEX_SPARK_QUOTA_SESSION] = buildPercentageQuota(sparkPrimaryWindow, sparkDisplayName);
  }
  const sparkSecondaryWindow = toRecord(
    getFieldValue(sparkRateLimit, "secondary_window", "secondaryWindow")
  );
  if (Object.keys(sparkSecondaryWindow).length > 0 && !isLatentWindow(sparkSecondaryWindow)) {
    quotas[CODEX_SPARK_QUOTA_WEEKLY] = buildPercentageQuota(
      sparkSecondaryWindow,
      `${sparkDisplayName} Weekly`
    );
  }
  return {
    rateLimit,
    quotas,
    ...bankedResetCredits !== void 0 ? { bankedResetCredits } : {},
    ...rateLimitReachedType !== void 0 ? { rateLimitReachedType } : {}
  };
}
export {
  buildCodexUsageQuotas,
  getFieldValue
};
