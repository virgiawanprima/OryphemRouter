import { RateLimitReason } from "../utils/omni/rateLimitConstants.js";
import { COOLDOWN_MS } from "../config/errorConfig.js";
const GLOBAL_KEY = "__omniroute_rotation_config__";
const DEFAULT_WINDOW_MS = 12e4;
function envBool(name, dflt) {
  const raw = process.env[name];
  if (raw === void 0 || raw === null || raw === "") return dflt;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return dflt;
}
function envInt(name, dflt, min = 0) {
  const raw = process.env[name];
  if (raw === void 0 || raw === null || raw === "") return dflt;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, n);
}
function buildClass(enableEnv, thresholdEnv, windowEnv, enableDefault) {
  return {
    enabled: envBool(enableEnv, enableDefault),
    threshold: envInt(thresholdEnv, 1, 1),
    windowMs: envInt(windowEnv, DEFAULT_WINDOW_MS / 1e3, 1) * 1e3
  };
}
function buildFromEnv() {
  return {
    enabled: envBool("OMNIROUTE_ROTATION_ENABLED", true),
    rateLimitResetMs: envInt("OMNIROUTE_ROTATION_RATE_LIMIT_RESET_SECONDS", 0, 0) * 1e3,
    disableTagWithoutReset: envBool("OMNIROUTE_ROTATION_DISABLE_TAG_WITHOUT_RESET", true),
    rateLimit429: buildClass(
      "OMNIROUTE_ROTATE_ON_429",
      "OMNIROUTE_ROTATE_429_THRESHOLD",
      "OMNIROUTE_ROTATE_429_WINDOW_SECONDS",
      true
    ),
    serverError500: buildClass(
      "OMNIROUTE_ROTATE_ON_500",
      "OMNIROUTE_ROTATE_500_THRESHOLD",
      "OMNIROUTE_ROTATE_500_WINDOW_SECONDS",
      true
    ),
    badGateway502: buildClass(
      "OMNIROUTE_ROTATE_ON_502",
      "OMNIROUTE_ROTATE_502_THRESHOLD",
      "OMNIROUTE_ROTATE_502_WINDOW_SECONDS",
      true
    ),
    badRequest400: buildClass(
      "OMNIROUTE_ROTATE_ON_400",
      "OMNIROUTE_ROTATE_400_THRESHOLD",
      "OMNIROUTE_ROTATE_400_WINDOW_SECONDS",
      false
    )
  };
}
function getGlobalRotationConfig() {
  const g = globalThis;
  let cfg = g[GLOBAL_KEY];
  if (!cfg) {
    cfg = buildFromEnv();
    g[GLOBAL_KEY] = cfg;
  }
  return cfg;
}
function resetGlobalRotationConfigForTest() {
  const g = globalThis;
  delete g[GLOBAL_KEY];
  clearRotationErrorCounters();
}
function coerceBool(v, dflt) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return envBoolFromString(v, dflt);
  return dflt;
}
function envBoolFromString(v, dflt) {
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return dflt;
}
function coerceInt(v, dflt, min = 0) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.floor(n));
}
function resolveRotationConfig(overrides) {
  const base = getGlobalRotationConfig();
  if (!overrides || typeof overrides !== "object") return base;
  const cls = (src, enableKey, thrKey, winKey) => ({
    enabled: enableKey in overrides ? coerceBool(overrides[enableKey], src.enabled) : src.enabled,
    threshold: thrKey in overrides ? coerceInt(overrides[thrKey], src.threshold, 1) : src.threshold,
    windowMs: winKey in overrides ? coerceInt(overrides[winKey], src.windowMs / 1e3, 1) * 1e3 : src.windowMs
  });
  return {
    enabled: base.enabled,
    rateLimitResetMs: "rateLimitResetSeconds" in overrides ? coerceInt(overrides.rateLimitResetSeconds, base.rateLimitResetMs / 1e3, 0) * 1e3 : base.rateLimitResetMs,
    disableTagWithoutReset: base.disableTagWithoutReset,
    rateLimit429: cls(base.rateLimit429, "rotateOn429", "error429Threshold", "error429WindowSeconds"),
    serverError500: cls(base.serverError500, "rotateOn500", "error500Threshold", "error500WindowSeconds"),
    badGateway502: cls(base.badGateway502, "rotateOn502", "error502Threshold", "error502WindowSeconds"),
    badRequest400: cls(base.badRequest400, "rotateOn400", "error400Threshold", "error400WindowSeconds")
  };
}
function classForStatus(status, cfg) {
  if (status === 429) return cfg.rateLimit429;
  if (status === 502) return cfg.badGateway502;
  if (status >= 500 && status < 600) return cfg.serverError500;
  if (status === 400) return cfg.badRequest400;
  return null;
}
function isFallbackBlockedForStatus(status, cfg) {
  const c = classForStatus(status, cfg);
  if (c === null) return false;
  if (c === cfg.badRequest400) return false;
  if (!cfg.enabled) return true;
  return !c.enabled;
}
function shouldForceFallbackFor400(status, cfg) {
  return status === 400 && cfg.enabled && cfg.badRequest400.enabled;
}
function rateLimitCooldownOverrideMs(cfg) {
  return cfg.rateLimitResetMs > 0 ? cfg.rateLimitResetMs : null;
}
const COUNTER_KEY = "__omniroute_rotation_counters__";
function counters() {
  const g = globalThis;
  let m = g[COUNTER_KEY];
  if (!m) {
    m = /* @__PURE__ */ new Map();
    g[COUNTER_KEY] = m;
  }
  return m;
}
function clearRotationErrorCounters() {
  counters().clear();
}
function recordErrorAndCheckThreshold(key, status, cfg, nowMs = Date.now()) {
  const cls = classForStatus(status, cfg);
  if (cls === null) return true;
  if (cls.threshold <= 1) return true;
  const bucketKey = `${key}::${status}`;
  const list = counters().get(bucketKey) ?? [];
  const windowStart = nowMs - cls.windowMs;
  const pruned = list.filter((ts) => ts >= windowStart);
  pruned.push(nowMs);
  counters().set(bucketKey, pruned);
  if (pruned.length >= cls.threshold) {
    counters().delete(bucketKey);
    return true;
  }
  return false;
}
function evaluateRotationGate(status, rotationCfg, rotationKey) {
  if (isFallbackBlockedForStatus(status, rotationCfg)) {
    return { shouldFallback: false, cooldownMs: 0, reason: RateLimitReason.UNKNOWN };
  }
  if (rotationKey && classForStatus(status, rotationCfg) && !recordErrorAndCheckThreshold(rotationKey, status, rotationCfg)) {
    return { shouldFallback: false, cooldownMs: 0, reason: RateLimitReason.UNKNOWN };
  }
  if (shouldForceFallbackFor400(status, rotationCfg)) {
    const overrideMs = rateLimitCooldownOverrideMs(rotationCfg);
    const cooldownMs = overrideMs ?? COOLDOWN_MS.rateLimit;
    return {
      shouldFallback: true,
      cooldownMs,
      baseCooldownMs: cooldownMs,
      newBackoffLevel: 0,
      reason: RateLimitReason.RATE_LIMIT_EXCEEDED
    };
  }
  return null;
}
function rotationRateLimitFallback(reason, rotationCfg) {
  if (reason !== RateLimitReason.RATE_LIMIT_EXCEEDED) return null;
  const overrideMs = rateLimitCooldownOverrideMs(rotationCfg);
  if (overrideMs === null) return null;
  return {
    shouldFallback: true,
    cooldownMs: overrideMs,
    baseCooldownMs: overrideMs,
    newBackoffLevel: 0,
    usedUpstreamRetryHint: false,
    reason
  };
}
function gateFor(status, account) {
  const { rotationOverrides, rotationKey } = extractRotationContext(account);
  return evaluateRotationGate(status, resolveRotationConfig(rotationOverrides), rotationKey);
}
function overrideFor(reason, account) {
  const { rotationOverrides } = extractRotationContext(account);
  return rotationRateLimitFallback(reason, resolveRotationConfig(rotationOverrides));
}
function extractRotationContext(account) {
  const rec = account && typeof account === "object" ? account : null;
  const psd = rec ? rec["providerSpecificData"] : void 0;
  const rotationOverrides = psd && typeof psd === "object" && psd.rotationOverrides && typeof psd.rotationOverrides === "object" ? psd.rotationOverrides : null;
  const id = rec ? rec["id"] : void 0;
  const rotationKey = typeof id === "string" && id.length > 0 ? id : null;
  return { rotationOverrides, rotationKey };
}
export {
  classForStatus,
  clearRotationErrorCounters,
  evaluateRotationGate,
  extractRotationContext,
  gateFor,
  getGlobalRotationConfig,
  isFallbackBlockedForStatus,
  overrideFor,
  rateLimitCooldownOverrideMs,
  recordErrorAndCheckThreshold,
  resetGlobalRotationConfigForTest,
  resolveRotationConfig,
  rotationRateLimitFallback,
  shouldForceFallbackFor400
};
