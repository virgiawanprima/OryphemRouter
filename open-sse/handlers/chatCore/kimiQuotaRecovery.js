function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function remaining(value) {
  if (!value) return null;
  const candidate = value.remaining ?? value.remainingPercentage;
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}
function getKimiTemporaryRateLimitResetAt(usage, nowMs = Date.now()) {
  const quotas = asRecord(asRecord(usage)?.quotas);
  const rateLimit = asRecord(quotas?.Ratelimit);
  const weekly = asRecord(quotas?.Weekly);
  const rateLimitRemaining = remaining(rateLimit);
  const weeklyRemaining = remaining(weekly);
  const resetAt = typeof rateLimit?.resetAt === "string" ? rateLimit.resetAt : null;
  const resetMs = resetAt ? new Date(resetAt).getTime() : NaN;
  if (rateLimitRemaining !== 0 || weeklyRemaining === null || weeklyRemaining <= 0 || !Number.isFinite(resetMs) || resetMs <= nowMs) {
    return null;
  }
  return resetAt;
}
export {
  getKimiTemporaryRateLimitResetAt
};
