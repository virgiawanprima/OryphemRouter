import { saveRequestUsage } from "../../utils/omni/usageDb.js";
import { recordTokenUsage } from "../../utils/omni/tokenLimitCounter.js";
import { computeBillableTokens } from "./upstreamTimeouts.js";
import { log } from "../../utils/log.js";
function persistStreamingUsageRow(usage, ctx) {
  const { provider, model, streamStatus, startTime, ttft, streamErrorCode } = ctx;
  saveRequestUsage({
    provider: provider || "unknown",
    model: model || "unknown",
    tokens: usage,
    status: String(streamStatus),
    success: streamStatus === 200,
    latencyMs: Date.now() - startTime,
    timeToFirstTokenMs: ttft,
    errorCode: streamStatus === 200 ? null : streamErrorCode || String(streamStatus),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    connectionId: ctx.connectionId || void 0,
    apiKeyId: ctx.apiKeyInfo?.id || void 0,
    apiKeyName: ctx.apiKeyInfo?.name || void 0,
    serviceTier: ctx.effectiveServiceTier,
    comboStrategy: ctx.isCombo ? ctx.comboStrategy || void 0 : void 0,
    endpoint: ctx.endpoint || void 0
  }).catch((err) => {
    log.error("USAGE", "Failed to save usage stats:", err.message);
  });
}
function recordStreamingBillableTokens(usage, ctx) {
  if (!ctx.apiKeyInfo?.id || ctx.streamStatus !== 200) return;
  try {
    const billable = computeBillableTokens(usage);
    if (billable > 0)
      recordTokenUsage(
        ctx.apiKeyInfo.id,
        ctx.provider || "unknown",
        ctx.model || "unknown",
        billable
      );
  } catch {
  }
}
function recordStreamingUsageStats(usage, ctx) {
  if (!usage || typeof usage !== "object") return;
  persistStreamingUsageRow(usage, ctx);
  recordStreamingBillableTokens(usage, ctx);
}
export {
  recordStreamingUsageStats
};
