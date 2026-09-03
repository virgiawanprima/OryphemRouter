const MODE_PACKS = {
  // Prioritize latency → health. tierPriority replaces 0.05 from stability.
  // tierAffinity/specificityMatch stay at 0 (manifest-routing-only weights).
  "ship-fast": {
    quota: 0.1333,
    health: 0.2667,
    costInv: 0.0476,
    latencyInv: 0.3048,
    taskFit: 0.0952,
    stability: 0,
    tierPriority: 0.0476,
    tierAffinity: 0,
    specificityMatch: 0,
    contextAffinity: 95e-4,
    sessionAvailability: 0.0476,
    resetWindowAffinity: 0,
    connectionDensity: 0.0476
  },
  // Prioritize cost. tierPriority replaces 0.05 from stability.
  "cost-saver": {
    quota: 0.1333,
    health: 0.181,
    costInv: 0.3524,
    latencyInv: 0.0476,
    taskFit: 0.0952,
    stability: 0.0476,
    tierPriority: 0.0476,
    tierAffinity: 0,
    specificityMatch: 0,
    contextAffinity: 0,
    sessionAvailability: 0.0476,
    resetWindowAffinity: 0,
    connectionDensity: 0.0476
  },
  // Prioritize task fitness. tierPriority replaces 0.05 from latencyInv.
  "quality-first": {
    quota: 0.0952,
    health: 0.1714,
    costInv: 0.0476,
    latencyInv: 0.0476,
    taskFit: 0.3524,
    stability: 0.1429,
    tierPriority: 0.0476,
    tierAffinity: 0,
    specificityMatch: 0,
    contextAffinity: 0,
    sessionAvailability: 0.0476,
    resetWindowAffinity: 0,
    connectionDensity: 0.0476
  },
  // Prioritize quota availability. tierPriority replaces 0.05 from taskFit.
  "offline-friendly": {
    quota: 0.3524,
    health: 0.2667,
    costInv: 0.0952,
    latencyInv: 0.0476,
    taskFit: 0,
    stability: 0.0952,
    tierPriority: 0.0476,
    tierAffinity: 0,
    specificityMatch: 0,
    contextAffinity: 0,
    sessionAvailability: 0.0476,
    resetWindowAffinity: 0,
    connectionDensity: 0.0476
  },
  // #4235 `:reliable` — prioritize healthy, low-variance providers (high availability).
  // health (circuit-breaker) + stability (latency std-dev) dominate; weights sum to ~1.0
  // (re-normalized after #8940 added sessionAvailability without rebalancing — #9985).
  "reliability-first": {
    quota: 0.1333,
    health: 0.3524,
    costInv: 0.0381,
    latencyInv: 0.0476,
    taskFit: 0.0952,
    stability: 0.1905,
    tierPriority: 0.0476,
    tierAffinity: 0,
    specificityMatch: 0,
    contextAffinity: 0,
    sessionAvailability: 0.0476,
    resetWindowAffinity: 0,
    connectionDensity: 0.0476
  },
  // Chaos mode — priority: health > stability > taskFit > latency.
  // Selects top-N healthy providers for parallel dispatch. Favors providers with
  // closed circuit breakers, low latency variance, and high task fitness.
  // quota weight reduced (chaos fans out in parallel, quota diversity is secondary
  // to picking the most stable providers); connectionDensity boosted slightly to
  // prefer providers with multiple accounts (more resilient to per-account rate limits).
  "chaos-mode": {
    quota: 0.0476,
    health: 0.4,
    costInv: 0.019,
    latencyInv: 0.0286,
    taskFit: 0.1905,
    stability: 0.1714,
    tierPriority: 0.019,
    tierAffinity: 0,
    specificityMatch: 0,
    contextAffinity: 0.0286,
    sessionAvailability: 0.0476,
    resetWindowAffinity: 0,
    connectionDensity: 0.0476
  }
};
function getModePack(name) {
  return MODE_PACKS[name];
}
function getModePackNames() {
  return Object.keys(MODE_PACKS);
}
export {
  MODE_PACKS,
  getModePack,
  getModePackNames
};
