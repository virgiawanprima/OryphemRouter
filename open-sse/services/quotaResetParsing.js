import { looksLikeQuotaExhausted } from "../utils/omni/classify429.js";
import { getProviderCategory } from "../config/providerRegistry.js";
function shouldPreserveQuotaSignals(provider, errorText) {
  if (!provider) return true;
  if (getProviderCategory(provider) === "oauth") return true;
  return Boolean(errorText) && looksLikeQuotaExhausted(errorText);
}
function parseDayGranularityResetMs(msg, maxMs, nowMs = Date.now()) {
  const dayMatch = /reset(?:s)?\s+in\s+(\d+)\s*day(?:s)?/i.exec(msg);
  if (dayMatch) {
    const days = Number.parseInt(dayMatch[1], 10);
    if (Number.isFinite(days) && days > 0) {
      return Math.min(days * 24 * 3600 * 1e3, maxMs);
    }
  }
  const isoMs = parseIsoDateTimeResetMs(msg, maxMs, nowMs);
  if (isoMs !== null) return isoMs;
  return parseMonthDayResetMs(msg, maxMs, nowMs);
}
function parseIsoDateTimeResetMs(msg, maxMs, nowMs = Date.now()) {
  const match = /\b(?:try again at|wait until|reset(?:s)?\s+at|available at|retry after)\s+(\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})?/i.exec(
    msg
  );
  if (!match) return null;
  const stamp = match[1].replace(/[Tt ]/, "T");
  const rawZone = match[2] ? match[2].toUpperCase() : "Z";
  const zone = /^[+-]\d{4}$/.test(rawZone) ? `${rawZone.slice(0, 3)}:${rawZone.slice(3)}` : rawZone;
  const resetMs = Date.parse(`${stamp}${zone}`);
  if (!Number.isFinite(resetMs)) return null;
  const waitMs = resetMs - nowMs;
  if (waitMs <= 0) return null;
  return Math.min(waitMs, maxMs);
}
function parseMonthDayResetMs(msg, maxMs, nowMs = Date.now()) {
  const match = /reset(?:s)?\s+at\s+(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*(?:UTC|Z)?/i.exec(
    msg
  );
  if (!match) return null;
  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  const hour = Number.parseInt(match[3], 10);
  const minute = Number.parseInt(match[4], 10);
  const second = match[5] ? Number.parseInt(match[5], 10) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const now = new Date(nowMs);
  let year = now.getUTCFullYear();
  let resetMs = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(resetMs)) return null;
  if (resetMs <= nowMs) {
    year += 1;
    resetMs = Date.UTC(year, month - 1, day, hour, minute, second);
  }
  const waitMs = resetMs - nowMs;
  if (!Number.isFinite(waitMs) || waitMs <= 0) return null;
  return Math.min(waitMs, maxMs);
}
export {
  parseDayGranularityResetMs,
  parseIsoDateTimeResetMs,
  parseMonthDayResetMs,
  shouldPreserveQuotaSignals
};
