import { registerQuotaFetcher, registerQuotaWindows } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
const FREEMODEL_WINDOW_5H = "window5h";
const FREEMODEL_WINDOW_7D = "window7d";
const FIVE_HOURS_MS = 5 * 60 * 60 * 1e3;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1e3;
function getRequestLimit(envVar, fallback) {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const accountStates = /* @__PURE__ */ new Map();
function freshWindow(now) {
  return { count: 0, windowStart: now };
}
function getOrCreateState(accountId, now) {
  let state = accountStates.get(accountId);
  if (!state) {
    state = { window5h: freshWindow(now), window7d: freshWindow(now) };
    accountStates.set(accountId, state);
  }
  return state;
}
function rollWindowIfExpired(window, durationMs, now) {
  if (now - window.windowStart >= durationMs) {
    return freshWindow(now);
  }
  return window;
}
function recordFreeModelRequest(accountId) {
  if (!accountId) return;
  const now = Date.now();
  const state = getOrCreateState(accountId, now);
  state.window5h = rollWindowIfExpired(state.window5h, FIVE_HOURS_MS, now);
  state.window7d = rollWindowIfExpired(state.window7d, SEVEN_DAYS_MS, now);
  state.window5h.count += 1;
  state.window7d.count += 1;
}
function resetFreeModelAccount(accountId) {
  accountStates.delete(accountId);
}
function clearFreeModelQuotaState() {
  accountStates.clear();
}
function toWindowInfo(window, durationMs, limit) {
  const percentUsed = limit > 0 ? Math.min(1, window.count / limit) : 0;
  const resetAt = new Date(window.windowStart + durationMs).toISOString();
  return { percentUsed, resetAt };
}
async function fetchFreeModelQuota(connectionId) {
  const state = accountStates.get(connectionId);
  if (!state) return null;
  const now = Date.now();
  const limit5h = getRequestLimit("FREEMODEL_5H_REQUEST_LIMIT", 500);
  const limit7d = getRequestLimit("FREEMODEL_7D_REQUEST_LIMIT", 2e3);
  const rolled5h = rollWindowIfExpired(state.window5h, FIVE_HOURS_MS, now);
  const rolled7d = rollWindowIfExpired(state.window7d, SEVEN_DAYS_MS, now);
  const window5h = toWindowInfo(rolled5h, FIVE_HOURS_MS, limit5h);
  const window7d = toWindowInfo(rolled7d, SEVEN_DAYS_MS, limit7d);
  const worstPercentUsed = Math.max(window5h.percentUsed, window7d.percentUsed);
  const dominantResetAt = worstPercentUsed === window5h.percentUsed ? window5h.resetAt : window7d.resetAt;
  return {
    used: Math.round(worstPercentUsed * 100),
    total: 100,
    percentUsed: worstPercentUsed,
    resetAt: dominantResetAt,
    windows: {
      [FREEMODEL_WINDOW_5H]: window5h,
      [FREEMODEL_WINDOW_7D]: window7d
    }
  };
}
function registerFreeModelQuotaFetcher() {
  registerQuotaFetcher("freemodel-dev", fetchFreeModelQuota);
  registerMonitorFetcher("freemodel-dev", fetchFreeModelQuota);
  registerQuotaWindows("freemodel-dev", [FREEMODEL_WINDOW_5H, FREEMODEL_WINDOW_7D]);
}
export {
  FREEMODEL_WINDOW_5H,
  FREEMODEL_WINDOW_7D,
  clearFreeModelQuotaState,
  fetchFreeModelQuota,
  recordFreeModelRequest,
  registerFreeModelQuotaFetcher,
  resetFreeModelAccount
};
