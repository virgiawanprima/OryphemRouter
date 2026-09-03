import geminiLimits from "../config/geminiRateLimits.json" with { type: "json" };
const dailyCounts = /* @__PURE__ */ new Map();
const minuteWindows = /* @__PURE__ */ new Map();
const tokenWindows = /* @__PURE__ */ new Map();
function toDateKey() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function stripModelPrefix(modelId) {
  return modelId.replace(/^gemini\//, "").trim();
}
function lookupValue(modelId, field) {
  if (!modelId) return 0;
  const key = stripModelPrefix(modelId);
  const entry = geminiLimits[key];
  if (!entry) {
    for (const [knownKey, knownEntry] of Object.entries(geminiLimits)) {
      if (key.endsWith(knownKey) || knownKey.endsWith(key)) {
        const val2 = knownEntry[field];
        return typeof val2 === "number" && val2 > 0 ? val2 : 0;
      }
    }
    return 0;
  }
  const val = entry[field];
  return typeof val === "number" && val > 0 ? val : 0;
}
function getModelRpd(modelId) {
  return lookupValue(modelId, "rpd");
}
function incrementDailyRequestCount(modelId) {
  if (!modelId) return;
  const key = stripModelPrefix(modelId);
  const today = toDateKey();
  const existing = dailyCounts.get(key);
  if (existing && existing.date === today) {
    existing.count++;
  } else {
    dailyCounts.set(key, { date: today, count: 1 });
  }
}
function getDailyRequestCount(modelId) {
  if (!modelId) return 0;
  const key = stripModelPrefix(modelId);
  const today = toDateKey();
  const entry = dailyCounts.get(key);
  if (entry && entry.date === today) return entry.count;
  return 0;
}
function isRpdExhausted(modelId) {
  const rpd = getModelRpd(modelId);
  if (rpd <= 0) return false;
  return getDailyRequestCount(modelId) >= rpd;
}
function getModelRpm(modelId) {
  return lookupValue(modelId, "rpm");
}
function pruneMinuteWindow(key) {
  const now = Date.now();
  const cutoff = now - 6e4;
  const timestamps = minuteWindows.get(key);
  if (!timestamps) return;
  let i = 0;
  while (i < timestamps.length && timestamps[i] < cutoff) i++;
  if (i > 0) {
    minuteWindows.set(key, timestamps.slice(i));
  }
}
function pruneTokenWindow(key) {
  const now = Date.now();
  const cutoff = now - 6e4;
  const entries = tokenWindows.get(key);
  if (!entries) return;
  let i = 0;
  while (i < entries.length && entries[i] < cutoff) i += 2;
  if (i > 0) {
    tokenWindows.set(key, entries.slice(i));
  }
}
function incrementMinuteRequestCount(modelId) {
  if (!modelId) return;
  const key = stripModelPrefix(modelId);
  pruneMinuteWindow(key);
  const timestamps = minuteWindows.get(key) ?? [];
  timestamps.push(Date.now());
  minuteWindows.set(key, timestamps);
}
function getMinuteRequestCount(modelId) {
  if (!modelId) return 0;
  const key = stripModelPrefix(modelId);
  pruneMinuteWindow(key);
  return minuteWindows.get(key)?.length ?? 0;
}
function isRpmExhausted(modelId) {
  const rpm = getModelRpm(modelId);
  if (rpm <= 0) return false;
  return getMinuteRequestCount(modelId) >= rpm;
}
function getModelTpm(modelId) {
  return lookupValue(modelId, "tpm");
}
function incrementTokenUsage(modelId, promptTokens) {
  if (!modelId || !Number.isFinite(promptTokens) || promptTokens <= 0) return;
  const key = stripModelPrefix(modelId);
  pruneTokenWindow(key);
  const entries = tokenWindows.get(key) ?? [];
  entries.push(Date.now(), promptTokens);
  tokenWindows.set(key, entries);
}
function getMinuteTokenCount(modelId) {
  if (!modelId) return 0;
  const key = stripModelPrefix(modelId);
  pruneTokenWindow(key);
  const entries = tokenWindows.get(key);
  if (!entries) return 0;
  let total = 0;
  for (let i = 1; i < entries.length; i += 2) {
    total += entries[i];
  }
  return total;
}
function isTpmExhausted(modelId) {
  const tpm = getModelTpm(modelId);
  if (tpm <= 0) return false;
  return getMinuteTokenCount(modelId) >= tpm;
}
function classifyGeminiQuotaMetricFromText(errorText) {
  if (!errorText) return null;
  const lower = errorText.toLowerCase();
  if (!lower.includes("generativelanguage.googleapis.com")) return null;
  if (lower.includes("_per_day") || lower.includes("per day")) return "rpd";
  if (lower.includes("input_token_count") || lower.includes("token_count")) return "tpm";
  if (lower.includes("_requests")) return "rpm";
  return null;
}
function incrementRequestCount(modelId) {
  incrementDailyRequestCount(modelId);
  incrementMinuteRequestCount(modelId);
}
function isMinuteRateExhausted(modelId) {
  return isRpmExhausted(modelId) || isTpmExhausted(modelId);
}
function resetCounters() {
  dailyCounts.clear();
  minuteWindows.clear();
  tokenWindows.clear();
}
export {
  classifyGeminiQuotaMetricFromText,
  getDailyRequestCount,
  getMinuteRequestCount,
  getMinuteTokenCount,
  getModelRpd,
  getModelRpm,
  getModelTpm,
  incrementDailyRequestCount,
  incrementMinuteRequestCount,
  incrementRequestCount,
  incrementTokenUsage,
  isMinuteRateExhausted,
  isRpdExhausted,
  isRpmExhausted,
  isTpmExhausted,
  resetCounters
};
