function usageDisplayTotalTokens(usage) {
  if (!usage) return void 0;
  const baseTotal = usage.inputTokens + usage.outputTokens;
  const explicitTotal = usage.totalTokens;
  return typeof explicitTotal === "number" ? Math.max(explicitTotal, baseTotal) : baseTotal;
}
export {
  usageDisplayTotalTokens
};
