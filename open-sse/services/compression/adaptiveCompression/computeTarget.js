function computeTarget(policy, modelContextLimit, requestMaxTokens, config) {
  if (policy === "absolute") {
    return Math.max(0, Math.floor(config.absoluteBudget));
  }
  if (policy === "percentage") {
    const pct = config.pct > 0 && config.pct <= 1 ? config.pct : 1;
    return Math.max(0, Math.floor(modelContextLimit * pct));
  }
  const reserve = typeof requestMaxTokens === "number" && requestMaxTokens > 0 ? requestMaxTokens : config.outputReserve;
  return Math.max(0, Math.floor(modelContextLimit - reserve - config.safetyMargin));
}
export {
  computeTarget
};
