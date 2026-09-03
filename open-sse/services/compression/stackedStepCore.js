function createStackAccumulator() {
  return {
    techniques: /* @__PURE__ */ new Set(),
    rules: /* @__PURE__ */ new Set(),
    breakdown: [],
    rtkRawOutputPointers: [],
    validationWarnings: /* @__PURE__ */ new Set(),
    validationErrors: /* @__PURE__ */ new Set(),
    fallbackApplied: false
  };
}
function decideStep(result, bailout) {
  if (!result.compressed) return { advance: false };
  const minGain = Math.max(0, bailout.minGainPercent ?? 10);
  const gain = result.stats?.savingsPercent ?? 0;
  if (gain < minGain) return { advance: false };
  return { advance: true };
}
function recordNullStatsStep(acc, engineId) {
  acc.validationWarnings.add(`${engineId}: skipped (no eligible content)`);
}
function mergeStackStep(acc, engineId, result) {
  if (!result.stats) {
    recordNullStatsStep(acc, engineId);
    acc.breakdown.push({
      engine: engineId,
      originalTokens: 0,
      compressedTokens: 0,
      savingsPercent: 0,
      techniquesUsed: []
    });
    return;
  }
  result.stats.techniquesUsed.forEach((technique) => acc.techniques.add(technique));
  result.stats.rulesApplied?.forEach((rule) => acc.rules.add(rule));
  result.stats.rtkRawOutputPointers?.forEach((pointer) => acc.rtkRawOutputPointers.push(pointer));
  result.stats.validationWarnings?.forEach((warning) => acc.validationWarnings.add(warning));
  result.stats.validationErrors?.forEach((error) => acc.validationErrors.add(error));
  acc.fallbackApplied = acc.fallbackApplied || result.stats.fallbackApplied === true;
  acc.breakdown.push({
    engine: engineId,
    originalTokens: result.stats.originalTokens,
    compressedTokens: result.stats.compressedTokens,
    savingsPercent: result.stats.savingsPercent,
    techniquesUsed: result.stats.techniquesUsed,
    ...result.stats.rulesApplied ? { rulesApplied: result.stats.rulesApplied } : {},
    ...result.stats.durationMs !== void 0 ? { durationMs: result.stats.durationMs } : {},
    // O agregado do pipeline soma tokens de todas as engines; a contabilidade
    // física do omniglyph só faz sentido no passo que a produziu.
    ...result.stats.omniglyph ? { omniglyph: result.stats.omniglyph } : {}
  });
}
export {
  createStackAccumulator,
  decideStep,
  mergeStackStep
};
