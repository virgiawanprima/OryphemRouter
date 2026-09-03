const DEFAULT_STALL_TIMEOUT_SEC = 300;
function resolveStallTimeoutSec(configuredSec) {
  if (typeof configuredSec === "number" && Number.isFinite(configuredSec)) {
    return Math.max(1, Math.ceil(configuredSec));
  }
  return DEFAULT_STALL_TIMEOUT_SEC;
}
export {
  DEFAULT_STALL_TIMEOUT_SEC,
  resolveStallTimeoutSec
};
