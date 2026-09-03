import { getDbInstance } from "../utils/omni/dbCore.js";
import {
  resetWindowIfElapsed,
  getWindowUsage,
  incrementWindowTokens,
  getTokenLimitsForRequest,
  logTokenLimitReset
} from "../utils/omni/localDbTokenLimits.js";
const cache = /* @__PURE__ */ new Map();
const CACHE_TTL_MS = 5e3;
function seedWindowUsageFromHistory(limit, now = Date.now()) {
  const { periodStartAt } = resetWindowIfElapsed(limit, now);
  const lowerBound = new Date(periodStartAt).toISOString();
  const db = getDbInstance();
  const tokenSum = `COALESCE(SUM(
      COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)
      + COALESCE(tokens_reasoning, 0)
    ), 0) AS total`;
  let row;
  if (limit.scopeType === "model") {
    row = db.prepare(
      `SELECT ${tokenSum} FROM usage_history
         WHERE api_key_id = ? AND model = ? AND timestamp >= ?`
    ).get(limit.apiKeyId, limit.scopeValue, lowerBound);
  } else if (limit.scopeType === "provider") {
    row = db.prepare(
      `SELECT ${tokenSum} FROM usage_history
         WHERE api_key_id = ? AND provider = ? AND timestamp >= ?`
    ).get(limit.apiKeyId, limit.scopeValue, lowerBound);
  } else {
    row = db.prepare(
      `SELECT ${tokenSum} FROM usage_history
         WHERE api_key_id = ? AND timestamp >= ?`
    ).get(limit.apiKeyId, lowerBound);
  }
  const total = row && typeof row === "object" ? row.total : 0;
  const n = typeof total === "number" ? total : Number(total);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function getCurrentWindowUsage(limit, now = Date.now(), forceFresh = false) {
  const { windowStart } = resetWindowIfElapsed(limit, now);
  const cached = cache.get(limit.id);
  if (!forceFresh && cached && cached.windowStart === windowStart && now - cached.syncedAt < CACHE_TTL_MS) {
    return cached.tokensUsed;
  }
  let dbUsage = getWindowUsage(limit, now);
  if (dbUsage === 0 && (!cached || cached.windowStart !== windowStart)) {
    const seeded = seedWindowUsageFromHistory(limit, now);
    if (seeded > 0) {
      dbUsage = incrementWindowTokens(limit.id, windowStart, seeded);
    }
  }
  cache.set(limit.id, { windowStart, tokensUsed: dbUsage, syncedAt: now });
  return dbUsage;
}
function addWindowTokens(limit, tokens, now = Date.now()) {
  const { windowStart } = resetWindowIfElapsed(limit, now);
  const delta = tokens > 0 ? Math.floor(tokens) : 0;
  const newTotal = incrementWindowTokens(limit.id, windowStart, delta);
  cache.set(limit.id, { windowStart, tokensUsed: newTotal, syncedAt: now });
  return newTotal;
}
function syncCache(limitId, windowStart, tokensUsed) {
  cache.set(limitId, { windowStart, tokensUsed, syncedAt: Date.now() });
}
function invalidateLimit(limitId) {
  cache.delete(limitId);
}
function clearTokenLimitCache() {
  cache.clear();
}
function checkTokenLimits(apiKeyId, provider = "", model = "", now = Date.now()) {
  if (!apiKeyId) return null;
  const limits = getTokenLimitsForRequest(apiKeyId, provider, model);
  if (!limits || limits.length === 0) return null;
  let worst = null;
  for (const limit of limits) {
    if (limit.enabled === false) continue;
    const limitValue = limit.tokenLimit;
    if (!Number.isFinite(limitValue) || limitValue <= 0) continue;
    const tokensUsed = getCurrentWindowUsage(limit, now, true);
    if (tokensUsed < limitValue) continue;
    const { windowStart, nextResetAt } = resetWindowIfElapsed(limit, now);
    const remaining = Math.max(0, limitValue - tokensUsed);
    const breach = {
      limitId: limit.id,
      scopeType: limit.scopeType,
      scopeValue: limit.scopeValue,
      limitValue,
      tokensUsed,
      remaining,
      windowStart,
      nextResetAt
    };
    if (worst === null || breach.remaining < worst.remaining || breach.remaining === worst.remaining && breach.limitValue < worst.limitValue) {
      worst = breach;
    }
  }
  return worst;
}
function recordTokenUsage(apiKeyId, provider, model, tokens) {
  if (!apiKeyId) return;
  const delta = Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0;
  if (delta <= 0) return;
  Promise.resolve().then(() => {
    const now = Date.now();
    const limits = getTokenLimitsForRequest(apiKeyId, provider || "", model || "");
    if (!limits || limits.length === 0) return;
    const db = getDbInstance();
    const applied = [];
    const tx = db.transaction(() => {
      for (const limit of limits) {
        if (limit.enabled === false) continue;
        const { windowStart } = resetWindowIfElapsed(limit, now);
        const currentRow = db.prepare(
          "SELECT tokens_used FROM api_key_token_counters WHERE limit_id = ? AND window_start = ?"
        ).get(limit.id, windowStart);
        if (!currentRow) {
          const priorRow = db.prepare(
            `SELECT window_start, tokens_used FROM api_key_token_counters
                 WHERE limit_id = ? AND window_start < ?
                 ORDER BY window_start DESC LIMIT 1`
          ).get(limit.id, windowStart);
          const prevTokens = priorRow && typeof priorRow.tokens_used === "number" ? priorRow.tokens_used : 0;
          if (prevTokens > 0) {
            logTokenLimitReset(limit.id, prevTokens, windowStart);
          }
          const seeded = seedWindowUsageFromHistory(limit, now);
          if (seeded > 0) {
            incrementWindowTokens(limit.id, windowStart, seeded);
          }
        }
        const total = incrementWindowTokens(limit.id, windowStart, delta);
        applied.push({ limitId: limit.id, windowStart, total });
      }
    });
    try {
      tx();
      for (const a of applied) {
        syncCache(a.limitId, a.windowStart, a.total);
      }
    } catch (err) {
      if (db.inTransaction) {
        try {
          db.exec("ROLLBACK");
        } catch {
        }
      }
    }
  }).catch(() => {
  });
}
export {
  addWindowTokens,
  checkTokenLimits,
  clearTokenLimitCache,
  getCurrentWindowUsage,
  invalidateLimit,
  recordTokenUsage,
  seedWindowUsageFromHistory,
  syncCache
};
