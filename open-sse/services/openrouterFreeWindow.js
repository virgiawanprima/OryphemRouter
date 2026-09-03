const RPM_WINDOW_MS = 6e4;
const RPM_LIMIT = 20;
const DAILY_LIMIT_BASE = 50;
const DAILY_LIMIT_PURCHASED = 1e3;
const accountWindows = /* @__PURE__ */ new Map();
function utcDayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}
function nextUtcMidnightIso(now) {
  const date = new Date(now);
  const next = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return new Date(next).toISOString();
}
function isFreeVariantModel(model) {
  return typeof model === "string" && model.endsWith(":free");
}
function resolveAccountKey(connectionId, connection) {
  const psd = connection?.providerSpecificData;
  const explicit = typeof psd?.openrouterAccountKey === "string" ? psd.openrouterAccountKey : "";
  return explicit.trim().length > 0 ? `acct:${explicit.trim()}` : `conn:${connectionId}`;
}
function getOrInitState(accountKey, now) {
  const dayKey = utcDayKey(now);
  const existing = accountWindows.get(accountKey);
  if (existing && existing.dayKey === dayKey) return existing;
  const fresh = {
    dayKey,
    dayCount: 0,
    purchasedAtLeast10: existing?.purchasedAtLeast10 ?? false,
    requestTimestamps: [],
    serverDailyLimit: null,
    serverDailyRemaining: null,
    serverResetAtMs: null
  };
  accountWindows.set(accountKey, fresh);
  return fresh;
}
function pruneRpmWindow(state, now) {
  const cutoff = now - RPM_WINDOW_MS;
  state.requestTimestamps = state.requestTimestamps.filter((ts) => ts > cutoff);
}
function setPurchasedTier(accountKey, purchasedAtLeast10) {
  const state = getOrInitState(accountKey, Date.now());
  state.purchasedAtLeast10 = purchasedAtLeast10;
}
function recordFreeWindowAttempt(accountKey, now = Date.now()) {
  const state = getOrInitState(accountKey, now);
  pruneRpmWindow(state, now);
  state.dayCount += 1;
  state.requestTimestamps.push(now);
}
function getHeader(headers, name) {
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const record = headers;
  return record[name] ?? record[name.toLowerCase()] ?? null;
}
function parseResetMsFromHeader(reset) {
  if (reset === null) return null;
  const resetNum = Number(reset);
  if (!Number.isFinite(resetNum)) return null;
  return resetNum > 1e10 ? resetNum : resetNum * 1e3;
}
function parseRetryAfterMs(retryAfter, now) {
  if (retryAfter === null) return null;
  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return now + seconds * 1e3;
}
function resolveResetMs(reset, retryAfter, now) {
  const headerResetMs = parseResetMsFromHeader(reset);
  const retryAfterMs = parseRetryAfterMs(retryAfter, now);
  if (retryAfterMs === null) return headerResetMs;
  return headerResetMs === null ? retryAfterMs : Math.max(headerResetMs, retryAfterMs);
}
function correctFromRateLimitHeaders(accountKey, headers, now = Date.now()) {
  const state = getOrInitState(accountKey, now);
  const limit = getHeader(headers, "x-ratelimit-limit");
  const remaining = getHeader(headers, "x-ratelimit-remaining");
  if (limit !== null && Number.isFinite(Number(limit))) {
    state.serverDailyLimit = Number(limit);
  }
  if (remaining !== null && Number.isFinite(Number(remaining))) {
    state.serverDailyRemaining = Number(remaining);
  }
  const resetMs = resolveResetMs(
    getHeader(headers, "x-ratelimit-reset"),
    getHeader(headers, "retry-after"),
    now
  );
  if (resetMs !== null) {
    state.serverResetAtMs = resetMs;
  }
}
function resolveDailyLimit(state) {
  if (state.serverDailyLimit !== null) return state.serverDailyLimit;
  return state.purchasedAtLeast10 ? DAILY_LIMIT_PURCHASED : DAILY_LIMIT_BASE;
}
function resolveDailyUsed(state, dailyLimit) {
  if (state.serverDailyRemaining !== null) {
    return Math.max(0, dailyLimit - state.serverDailyRemaining);
  }
  return state.dayCount;
}
function getFreeWindowStatus(accountKey, now = Date.now()) {
  const state = getOrInitState(accountKey, now);
  pruneRpmWindow(state, now);
  const dailyLimit = resolveDailyLimit(state);
  const dailyUsed = resolveDailyUsed(state, dailyLimit);
  const dailyResetAt = state.serverResetAtMs !== null ? new Date(state.serverResetAtMs).toISOString() : nextUtcMidnightIso(now);
  const rpmUsed = state.requestTimestamps.length;
  return {
    dailyLimit,
    dailyUsed,
    dailyRemaining: Math.max(0, dailyLimit - dailyUsed),
    dailyResetAt,
    rpmLimit: RPM_LIMIT,
    rpmUsed,
    rpmRemaining: Math.max(0, RPM_LIMIT - rpmUsed)
  };
}
function clearFreeWindowState() {
  accountWindows.clear();
}
export {
  clearFreeWindowState,
  correctFromRateLimitHeaders,
  getFreeWindowStatus,
  isFreeVariantModel,
  recordFreeWindowAttempt,
  resolveAccountKey,
  setPurchasedTier
};
