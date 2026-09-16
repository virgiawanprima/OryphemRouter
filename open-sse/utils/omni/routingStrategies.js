// ADAPTED STUB — OmniRoute src/shared/constants/routingStrategies.ts (value subset).
export const ROUTING_STRATEGY_VALUES = [
  "priority", "weighted", "round-robin", "context-relay", "fill-first", "p2c",
  "random", "least-used", "cost-optimized", "reset-aware", "reset-window",
  "headroom", "strict-random", "auto", "lkgp", "context-optimized",
  "cache-optimized", "fusion", "pipeline",
];
export const AUTO_ROUTING_STRATEGY_VALUES = [
  "rules", "cost", "eco", "latency", "fast", "sla-aware", "sla", "lkgp",
];
export function normalizeRoutingStrategy(value) {
  const s = String(value || "").toLowerCase().trim();
  return ROUTING_STRATEGY_VALUES.includes(s) ? s : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBO-LEVEL strategies — the values a COMBO can actually be set to.
//
// This is deliberately NARROWER than ROUTING_STRATEGY_VALUES above. That list is the
// full set of names ported from the reference implementation; most of them are
// implemented by the auto-combo engine's own registry (see
// open-sse/services/autoCombo/routerStrategy.js) rather than by the combo dispatcher.
//
// RULE for adding a value here: it must be handled by the combo runtime AND have a
// behaviour test. A name that is only "ported" must not be selectable — offering a
// strategy the engine silently ignores is the same failure mode as advertising an
// endpoint a provider does not serve.
//
// `fallback` is intentionally first: it is the default, and it is not part of the
// ported reference list (whose nearest equivalent is `priority`).
// ─────────────────────────────────────────────────────────────────────────────
export const COMBO_STRATEGIES = [
  {
    value: "fallback",
    label: "Fallback: try in order",
    description: "Walk the chain and stop at the first model that answers. The default.",
  },
  {
    value: "round-robin",
    label: "Round Robin: rotate",
    description: "Rotate the starting model per request (optional sticky limit per model).",
  },
  {
    value: "cost-optimized",
    label: "Cost Optimized: cheapest first",
    description: "Reorder the chain by provider cost tier before falling back.",
  },
  {
    value: "auto",
    label: "Auto: AI-ranked (opt-in)",
    description: "Hand ordering to the auto-combo engine's live scoring (15 factors).",
  },
  {
    value: "fusion",
    label: "Fusion: panel + judge",
    description: "Ask every panel model in parallel, then let a judge synthesise one answer.",
  },
  {
    value: "pipeline",
    label: "Pipeline: chain steps",
    description: "Feed each step's output into the next one as added context.",
  },
];

export const COMBO_STRATEGY_VALUES = COMBO_STRATEGIES.map((s) => s.value);

/** Normalise a combo-level strategy name, or null when it is not selectable. */
export function normalizeComboStrategy(value) {
  const s = String(value || "").toLowerCase().trim();
  return COMBO_STRATEGY_VALUES.includes(s) ? s : null;
}

/**
 * Validate the strategy fields of a settings payload.
 *
 * Accepts the two shapes that reach the runtime:
 *   comboStrategy   — the global default (`settings.comboStrategy`)
 *   comboStrategies — per-combo map: { [comboName]: { fallbackStrategy, judgeModel, … } }
 *
 * Returns `{ ok: true, comboStrategy?, comboStrategies? }` with normalised values, or
 * `{ ok: false, error }` describing the FIRST offender. Unknown values are REJECTED
 * rather than silently coerced to the default: a router that quietly ignores a strategy
 * it was handed gives the operator no way to tell a typo from a no-op.
 */
export function validateComboStrategySettings(body) {
  if (!body || typeof body !== "object") return { ok: true };

  const out = { ok: true };

  if (Object.prototype.hasOwnProperty.call(body, "comboStrategy")) {
    const raw = body.comboStrategy;
    // null / "" means "use the default" and is allowed (clears the override).
    if (raw !== null && raw !== undefined && raw !== "") {
      const normalized = normalizeComboStrategy(raw);
      if (!normalized) {
        return {
          ok: false,
          error: `Invalid comboStrategy '${raw}'. Valid values: ${COMBO_STRATEGY_VALUES.join(", ")}`,
        };
      }
      out.comboStrategy = normalized;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "comboStrategies")) {
    const map = body.comboStrategies;
    if (map !== null && typeof map === "object" && !Array.isArray(map)) {
      for (const [comboName, entry] of Object.entries(map)) {
        if (!entry || typeof entry !== "object") continue;
        if (!Object.prototype.hasOwnProperty.call(entry, "fallbackStrategy")) continue;
        const raw = entry.fallbackStrategy;
        if (raw === null || raw === undefined || raw === "") continue;
        const normalized = normalizeComboStrategy(raw);
        if (!normalized) {
          return {
            ok: false,
            error: `Invalid fallbackStrategy '${raw}' for combo '${comboName}'. Valid values: ${COMBO_STRATEGY_VALUES.join(", ")}`,
          };
        }
      }
    }
  }

  return out;
}
