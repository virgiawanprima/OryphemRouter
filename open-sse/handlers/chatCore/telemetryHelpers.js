import { fetchLiveProviderLimits } from "../../utils/omni/providerLimits.js";
import { isClaudeExtraUsageBlockEnabled } from "../../utils/omni/claudeExtraUsage.js";
const LIVE_WS_MAX_CONSECUTIVE_FAILURES = 3;
const LIVE_WS_DISABLE_MS = 6e4;
let liveWsConsecutiveFailures = 0;
let liveWsDisabledUntil = 0;
function __resetLiveWsForwardingState() {
  liveWsConsecutiveFailures = 0;
  liveWsDisabledUntil = 0;
}
async function forwardDashboardEventToLiveWs(event, payload, fetchImpl = fetch, now = Date.now) {
  if (liveWsDisabledUntil > now()) return;
  const port = process.env.LIVE_WS_PORT || "20132";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    await fetchImpl(`http://127.0.0.1:${port}/__omniroute_event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, payload, timestamp: now() }),
      signal: controller.signal
    });
    liveWsConsecutiveFailures = 0;
    liveWsDisabledUntil = 0;
  } catch {
    liveWsConsecutiveFailures += 1;
    if (liveWsConsecutiveFailures >= LIVE_WS_MAX_CONSECUTIVE_FAILURES) {
      liveWsDisabledUntil = now() + LIVE_WS_DISABLE_MS;
      liveWsConsecutiveFailures = 0;
    }
  } finally {
    clearTimeout(timeout);
  }
}
async function maybeSyncClaudeExtraUsageState({
  provider,
  connectionId,
  providerSpecificData,
  log
}) {
  if (!connectionId || !isClaudeExtraUsageBlockEnabled(provider, providerSpecificData)) {
    return;
  }
  try {
    await fetchLiveProviderLimits(connectionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.debug?.("CLAUDE_USAGE", `Failed to sync Claude extra-usage state: ${message}`);
  }
}
export {
  __resetLiveWsForwardingState,
  forwardDashboardEventToLiveWs,
  maybeSyncClaudeExtraUsageState
};
