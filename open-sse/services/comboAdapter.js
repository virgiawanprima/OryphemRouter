// AutoCombo integration adapter (OmniRoute ported engine).
//
// Exposes the ported `autoCombo/engine.js` (selectProvider) behind a clean,
// OPT-IN interface so the existing native combo system (`services/combo.js`)
// is never modified. Enable with ORYPHEM_AUTOCOMBO_ENABLED=1.
//
// Degradation: disabled / module-error / no-candidates → returns null so the
// caller falls back to the native strategy (never blocks routing).

import { log } from "../utils/log.js";

let enabled = process.env.ORYPHEM_AUTOCOMBO_ENABLED === "1";
let warned = false;

function maybeWarn() {
  if (enabled && !warned) {
    warned = true;
    log.info("AUTO-COMBO", "ported autoCombo engine enabled (ORYPHEM_AUTOCOMBO_ENABLED=1)");
  }
}

async function loadEngine() {
  const { selectProvider } = await import("./autoCombo/engine.js");
  const { selectWithStrategy } = await import("./autoCombo/routerStrategy.js");
  return { selectProvider, selectWithStrategy };
}

/**
 * Select an auto-combo target from candidate models.
 * @param {object} params
 * @param {string} params.provider - provider id (or "auto")
 * @param {string} [params.model] - requested model
 * @param {Array<{provider:string, model:string, connectionId?:string, cost?:number, latency?:number}>} params.candidates
 * @param {object} [params.opts] - extra options passed to the engine (weights, mode, etc.)
 * @returns {Promise<{provider:string, model:string, connectionId?:string}|null>}
 */
export async function selectAutoCombo({ provider, model, candidates = [], opts = {} }) {
  if (!enabled) return null;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  maybeWarn();
  try {
    const { selectProvider, selectWithStrategy } = await loadEngine();
    // Named routing strategy (e.g. "weighted", "least-used", "headroom", "p2c",
    // "reset-window", "cache-optimized", "context-relay", ...) → use the engine's
    // selectWithStrategy over the candidate pool. Falls back for unknown names.
    if (opts.strategy && opts.strategy !== "rules") {
      const pool = candidates.map((c) => ({
        provider: c.provider,
        model: c.model,
        connectionId: c.connectionId,
        circuitBreakerState: c.circuitBreakerState ?? "CLOSED",
        costPer1MTokens: Number(c.costPer1MTokens ?? c.cost ?? 0),
        currentLoad: Number(c.currentLoad ?? 0),
        headroomRemaining: Number(c.headroomRemaining ?? c.quotaRemaining ?? 0),
        weight: Number(c.weight ?? 1),
        quotaResetIntervalSecs: Number(c.quotaResetIntervalSecs ?? 0),
        resetWindowAffinity: Number(c.resetWindowAffinity ?? 0),
        cacheAffinity: Number(c.cacheAffinity ?? 0),
        contextAffinity: Number(c.contextAffinity ?? 0),
        connectionPoolSize: Number(c.connectionPoolSize ?? 0),
      }));
      const picked = selectWithStrategy(pool, { taskType: opts.taskType, messages: opts.promptMessages }, opts.strategy);
      if (picked && picked.provider) {
        return {
          provider: picked.provider,
          model: picked.model,
          connectionId: picked.connectionId,
          score: picked.finalScore,
          strategy: picked.strategy,
        };
      }
    }
    const result = selectProvider(
      {
        name: opts.name || "auto",
        weights: opts.weights,
        modePack: opts.modePack,
        candidatePool: opts.candidatePool || [],
        explorationRate: opts.explorationRate ?? 0,
        budgetCap: opts.budgetCap,
        budgetFallback: opts.budgetFallback,
        ...opts,
      },
      candidates,
      opts.taskType,
      opts.promptMessages,
    );
    if (!result || !result.provider) return null;
    return {
      provider: result.provider,
      model: result.model,
      connectionId: result.connectionId,
      score: result.score,
    };
  } catch (e) {
    log.warn("AUTO-COMBO", `engine error, falling back to native combo: ${e?.message}`);
    return null;
  }
}

/** Enable/disable at runtime (for tests / toggles). */
export function setAutoComboEnabled(flag) {
  enabled = !!flag;
}

export function isAutoComboEnabled() {
  return enabled;
}
