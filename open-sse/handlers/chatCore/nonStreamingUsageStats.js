import { saveRequestUsage } from "../../utils/omni/usageDb.js";
import { formatUsageLog } from "../../utils/omni/tokenAccounting.js";
import { COLORS } from "../../utils/stream.js";
import { recordTokenUsage } from "../../utils/omni/tokenLimitCounter.js";
import { computeBillableTokens } from "./upstreamTimeouts.js";
import { log } from "../../utils/log.js";
function logUsageTrace(usage, provider, connectionId) {
  const msg = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}] \u{1F4CA} [USAGE] ${provider?.toUpperCase()} | ${formatUsageLog(usage)}${connectionId ? ` | account=${connectionId.slice(0, 8)}...` : ""}`;
  log.info("USAGE", `${COLORS.green}${msg}${COLORS.reset}`);
}
function persistUsageRow(usage, ctx) {
  const { provider, connectionId, model, startTime, apiKeyInfo, effectiveServiceTier } = ctx;
  saveRequestUsage({
    provider: provider || "unknown",
    model: model || "unknown",
    tokens: usage,
    status: "200",
    success: true,
    latencyMs: Date.now() - startTime,
    timeToFirstTokenMs: Date.now() - startTime,
    errorCode: null,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    connectionId: connectionId || void 0,
    apiKeyId: apiKeyInfo?.id || void 0,
    apiKeyName: apiKeyInfo?.name || void 0,
    serviceTier: effectiveServiceTier,
    comboStrategy: ctx.isCombo ? ctx.comboStrategy || void 0 : void 0,
    endpoint: ctx.endpoint || void 0
  }).catch((err) => {
    log.error("USAGE", "Failed to save usage stats:", err.message);
  });
}
function recordBillableTokens(usage, apiKeyInfo, provider, model) {
  if (!apiKeyInfo?.id) return;
  try {
    const billable = computeBillableTokens(usage);
    if (billable > 0)
      recordTokenUsage(apiKeyInfo.id, provider || "unknown", model || "unknown", billable);
  } catch {
  }
}
function recordNonStreamingUsageStats(usage, ctx) {
  if (!usage || typeof usage !== "object") return;
  if (ctx.traceEnabled) logUsageTrace(usage, ctx.provider, ctx.connectionId);
  persistUsageRow(usage, ctx);
  recordBillableTokens(usage, ctx.apiKeyInfo, ctx.provider, ctx.model);
}
export {
  recordNonStreamingUsageStats
};
