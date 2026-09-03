import { FREE_MODEL_BUDGETS } from "./freeModelCatalog.data.js";
import { FREE_MODEL_BUDGETS as FREE_MODEL_BUDGETS2 } from "./freeModelCatalog.data.js";
const RECURRING = /* @__PURE__ */ new Set(["recurring-daily", "recurring-monthly", "keyless"]);
const FREE_TIER_BOOSTS = {
  "openrouter-free": {
    provider: "openrouter",
    boostMonthlyTokens: 24e6,
    note: "A one-time $10 lifetime top-up raises the free pool from 50 to 1000 requests/day (~24M tokens/month)."
  }
};
function fmt(n) {
  return n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : Math.round(n / 1e6) + "M";
}
function dedupedSum(models, pick, include) {
  const poolMax = /* @__PURE__ */ new Map();
  let loose = 0;
  for (const m of models) {
    if (!include(m)) continue;
    const key = m.poolKey;
    if (key) poolMax.set(key, Math.max(poolMax.get(key) ?? 0, pick(m)));
    else loose += pick(m);
  }
  for (const v of poolMax.values()) loose += v;
  return loose;
}
function computeFreeModelTotals(opts = {}) {
  const models = FREE_MODEL_BUDGETS2.filter((m) => !(opts.excludeTosAvoid && m.tos === "avoid"));
  const steadyRecurringTokens = dedupedSum(
    models,
    (m) => m.monthlyTokens,
    (m) => RECURRING.has(m.freeType)
  );
  const recurringCredits = dedupedSum(
    models,
    (m) => m.creditTokens,
    (m) => m.freeType === "recurring-credit"
  );
  const oneTimeCredits = dedupedSum(
    models,
    (m) => m.creditTokens,
    (m) => m.freeType === "one-time-initial"
  );
  const steadyWithRecurringCreditsTokens = steadyRecurringTokens + recurringCredits;
  const firstMonthRealisticTokens = steadyWithRecurringCreditsTokens + oneTimeCredits;
  const poolCount = new Set(
    models.filter((m) => RECURRING.has(m.freeType) && m.poolKey).map((m) => m.poolKey)
  ).size;
  const livePools = new Set(
    models.filter((m) => RECURRING.has(m.freeType) && m.poolKey).map((m) => m.poolKey)
  );
  const boostMonthlyTokens = Object.entries(FREE_TIER_BOOSTS).filter(([pool]) => livePools.has(pool)).reduce((s, [, b]) => s + b.boostMonthlyTokens, 0);
  const uncappedProviders = [
    ...new Set(models.filter((m) => m.freeType === "recurring-uncapped").map((m) => m.provider))
  ].sort();
  return {
    steadyRecurringTokens,
    steadyWithRecurringCreditsTokens,
    firstMonthRealisticTokens,
    boostMonthlyTokens,
    uncappedProviders,
    modelCount: models.length,
    poolCount,
    perModel: models.slice().sort((a, b) => b.monthlyTokens - a.monthlyTokens),
    headline: `~${fmt(steadyRecurringTokens)} documented free tokens/month (steady), up to ~${fmt(firstMonthRealisticTokens)} in your first month with signup credits`
  };
}
export {
  FREE_MODEL_BUDGETS,
  FREE_TIER_BOOSTS,
  computeFreeModelTotals
};
