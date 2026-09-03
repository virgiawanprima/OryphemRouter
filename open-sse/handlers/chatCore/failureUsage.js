function buildFailureUsageRecord(opts) {
  return {
    provider: opts.provider || "unknown",
    model: opts.model || "unknown",
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, reasoning: 0 },
    status: String(opts.statusCode),
    success: false,
    latencyMs: opts.latencyMs,
    timeToFirstTokenMs: 0,
    errorCode: opts.errorCode || String(opts.statusCode),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    connectionId: opts.connectionId || void 0,
    apiKeyId: opts.apiKeyInfo?.id || void 0,
    apiKeyName: opts.apiKeyInfo?.name || void 0,
    serviceTier: opts.effectiveServiceTier,
    comboStrategy: opts.isCombo ? opts.comboStrategy || void 0 : void 0,
    endpoint: opts.endpoint || void 0
  };
}
export {
  buildFailureUsageRecord
};
