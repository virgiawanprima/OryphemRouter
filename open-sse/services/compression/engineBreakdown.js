function ensureEngineBreakdown(stats) {
  if (stats.engineBreakdown && stats.engineBreakdown.length > 0) {
    return stats.engineBreakdown;
  }
  return [
    {
      engine: stats.engine || stats.mode || "compression",
      originalTokens: stats.originalTokens,
      compressedTokens: stats.compressedTokens,
      savingsPercent: stats.savingsPercent,
      techniquesUsed: stats.techniquesUsed ?? [],
      ...stats.rulesApplied ? { rulesApplied: stats.rulesApplied } : {},
      ...stats.durationMs !== void 0 ? { durationMs: stats.durationMs } : {}
    }
  ];
}
function reconcileSingleEngineTokens(breakdown, outerOriginalTokens, outerCompressedTokens, outerSavingsPercent) {
  if (breakdown.length !== 1) return breakdown;
  const [entry] = breakdown;
  return [
    {
      ...entry,
      originalTokens: outerOriginalTokens,
      compressedTokens: outerCompressedTokens,
      savingsPercent: outerSavingsPercent
    }
  ];
}
export {
  ensureEngineBreakdown,
  reconcileSingleEngineTokens
};
