import { TRANSIENT_COOLDOWN_MS, COOLDOWN_MS } from "../config/errorConfig.js";
const EVICT_AFTER_TERMINAL = 3;
function isAccountEvicted(account) {
  return account.evictedAt != null;
}
const COOLDOWN_BASE_MS = TRANSIENT_COOLDOWN_MS;
const COOLDOWN_MAX_MS = COOLDOWN_MS.transientMax;
function isAccountReady(account) {
  return account.cooldownUntil <= Date.now();
}
function pickAccount(accounts, state, isReady = isAccountReady) {
  for (let i = 0; i < accounts.length; i++) {
    const idx = (state.nextAccountIdx + i) % accounts.length;
    const acct = accounts[idx];
    if (isReady(acct)) {
      state.nextAccountIdx = (idx + 1) % accounts.length;
      return acct;
    }
  }
  const fallbackIdx = state.nextAccountIdx % accounts.length;
  state.nextAccountIdx = (state.nextAccountIdx + 1) % accounts.length;
  return accounts[fallbackIdx];
}
function markCooldown(account, kind = "transient") {
  account.consecutiveFails++;
  const backoff = Math.min(
    COOLDOWN_BASE_MS * Math.pow(2, account.consecutiveFails - 1),
    COOLDOWN_MAX_MS
  );
  account.cooldownUntil = Date.now() + backoff + Math.random() * 1e3;
  if (kind === "terminal" && account.consecutiveFails >= EVICT_AFTER_TERMINAL) {
    account.evictedAt = Date.now();
  }
}
function markSuccess(account) {
  account.consecutiveFails = 0;
  account.evictedAt = null;
}
function maskAccountId(fingerprint) {
  if (!fingerprint) return "direct";
  return `${fingerprint.slice(0, 8)}\u2026`;
}
function isNetworkErrorRotatable(account) {
  return account.proxy !== null;
}
function isEmptyUpstreamRejection(status, bodyText) {
  if (status !== 400) return false;
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return false;
  }
  const choices = parsed?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return false;
  const rawMessage = first.message;
  if (typeof rawMessage === "undefined" || rawMessage === null) return false;
  if (typeof parsed !== "object" || parsed === null) return false;
  if ("error" in parsed) return false;
  const msg = rawMessage;
  if ("tool_calls" in msg) return false;
  if ("reasoning_content" in msg) return false;
  const content = msg.content;
  if (content !== void 0 && content !== null && content !== "") return false;
  if (first.finish_reason !== null && first.finish_reason !== void 0) return false;
  return true;
}
function extractChatcmplId(bodyText) {
  const match = /"id"\s*:\s*"(chatcmpl_[^"]+)"/.exec(bodyText);
  return match ? match[1] : "unknown";
}
export {
  extractChatcmplId,
  isAccountEvicted,
  isAccountReady,
  isEmptyUpstreamRejection,
  isNetworkErrorRotatable,
  markCooldown,
  markSuccess,
  maskAccountId,
  pickAccount
};
