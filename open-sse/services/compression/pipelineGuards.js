function guardPipelineInflation(input) {
  const { originalTokens, compressedTokens } = input;
  if (originalTokens > 0 && compressedTokens > originalTokens) {
    return { body: input.originalBody, inflated: true };
  }
  return { body: input.compressedBody, inflated: false };
}
function applyStackedInflationGuard(originalBody, currentBody, compressed, stats) {
  if (!compressed) return { body: currentBody, compressed, stats };
  const inflation = guardPipelineInflation({
    originalBody,
    compressedBody: currentBody,
    originalTokens: stats.originalTokens,
    compressedTokens: stats.compressedTokens
  });
  if (!inflation.inflated) return { body: currentBody, compressed, stats };
  const inflatedTokens = stats.compressedTokens;
  const warnings = new Set(stats.validationWarnings ?? []);
  warnings.add(
    `pipeline-inflation-guard: stacked output (${inflatedTokens} tok) did not shrink input (${stats.originalTokens} tok); reverted to original`
  );
  stats.validationWarnings = Array.from(warnings);
  stats.fallbackApplied = true;
  stats.compressedTokens = stats.originalTokens;
  stats.savingsPercent = 0;
  return { body: inflation.body, compressed: false, stats };
}
export {
  applyStackedInflationGuard,
  guardPipelineInflation
};
