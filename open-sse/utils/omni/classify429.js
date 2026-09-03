// ADAPTED STUB — OmniRoute `src/shared/utils/classify429.ts` classifies HTTP
// 429 bodies as rate-limit vs quota-exhausted via heuristic regexes. Ported
// subset: `looksLikeQuotaExhausted` only (used by quotaResetParsing).
const QUOTA_PATTERNS = [
  /daily.*limit/i,
  /daily.*quota/i,
  /per.?day.*limit/i,
  /monthly.*limit/i,
  /monthly.*quota/i,
  /per.?month.*limit/i,
  /quota.*exceed/i,
  /exceed.*quota/i,
  /insufficient.*quota/i,
  /billing.*cap/i,
  /credit.*exhaust/i,
  /out of credits/i,
  /hard.?limit/i,
  /plan.*limit/i,
  /quota reached/i,
  /limit reached/i,
  /quota/i,
];

/**
 * Returns true when an error body explicitly signals quota exhaustion
 * (vs a transient rate limit).
 */
export function looksLikeQuotaExhausted(errorText) {
  if (!errorText) return false;
  const text = String(errorText);
  return QUOTA_PATTERNS.some((re) => re.test(text));
}
