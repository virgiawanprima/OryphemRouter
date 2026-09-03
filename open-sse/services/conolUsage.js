import { normalizeConolCookie } from "./conolAuth.js";
function numberValue(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
function remainingQuota(remaining, total = remaining) {
  const boundedTotal = Math.max(total, remaining);
  const used = Math.max(0, boundedTotal - remaining);
  return {
    used,
    total: boundedTotal,
    remaining,
    remainingPercentage: boundedTotal > 0 ? Math.round(remaining / boundedTotal * 1e3) / 10 : 0,
    resetAt: null,
    unlimited: false
  };
}
function buildConolUsageResult(balance) {
  const daily = numberValue(balance.dailyCredits);
  const subscription = numberValue(balance.subscriptionCredits);
  const subscriptionAmount = numberValue(balance.subscriptionAmount);
  const extra = numberValue(balance.extraCredits);
  const aggregate = numberValue(balance.total) || daily + subscription + extra;
  return {
    plan: subscriptionAmount > 0 ? "Subscription" : "Free",
    quotas: {
      credits: remainingQuota(aggregate),
      daily: remainingQuota(daily),
      subscription: remainingQuota(subscription, subscriptionAmount || subscription),
      extra: remainingQuota(extra)
    },
    message: null
  };
}
function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function readProviderValue(data, keys) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const record = data;
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return "";
}
async function getConolUsage(apiKey, providerSpecificData) {
  const raw = readProviderValue(providerSpecificData, [
    "cookie",
    "__Secure-better-auth.session_token",
    "sessionToken"
  ]) || readString(apiKey);
  const cookie = normalizeConolCookie(raw);
  if (!cookie) return { message: "Missing Conol session cookie" };
  try {
    const response = await fetch("https://conol.ai/api/billing/balance", {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie,
        referer: "https://conol.ai/home"
      },
      signal: AbortSignal.timeout(15e3)
    });
    if (response.status === 401 || response.status === 403) {
      return { message: "Conol session expired or is invalid" };
    }
    if (!response.ok) {
      return { message: `Conol balance request failed (HTTP ${response.status})` };
    }
    return buildConolUsageResult(await response.json());
  } catch {
    return { message: "Conol balance request failed" };
  }
}
export {
  buildConolUsageResult,
  getConolUsage
};
