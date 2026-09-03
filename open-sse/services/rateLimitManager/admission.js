import { markLocalRateLimitError, RATE_LIMIT_QUEUE_FULL_CODE } from "./errors.js";
function checkQueueAdmission(queuedCount, maxQueueDepth, identity) {
  if (!maxQueueDepth || maxQueueDepth <= 0) return null;
  if (queuedCount < maxQueueDepth) return null;
  const err = new Error(
    `Request rejected: the local rate-limit queue for ${identity} already holds ${queuedCount} queued request(s), at or above the configured admission cap maxQueueDepth (${maxQueueDepth}) \u2014 this is OmniRoute's request queue (resilienceSettings.requestQueue.maxQueueDepth), not an upstream rejection. Raise it in Settings \u2192 Resilience if this is expected burst traffic.`
  );
  return markLocalRateLimitError(err, RATE_LIMIT_QUEUE_FULL_CODE);
}
export {
  checkQueueAdmission
};
