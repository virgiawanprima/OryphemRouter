import crypto from "node:crypto";
const FNV_OFFSET_I64 = -3750763034362895579n;
const FNV_PRIME_I64 = 1099511628211n;
function toNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function getProviderDataString(credentials, key) {
  const data = credentials?.providerSpecificData;
  return data && typeof data === "object" ? toNonEmptyString(data[key]) : null;
}
function getAntigravityAccountKey(credentials) {
  return toNonEmptyString(credentials?.email) || getProviderDataString(credentials, "email") || getProviderDataString(credentials, "accountId") || toNonEmptyString(credentials?.connectionId) || null;
}
function getAntigravityEnvelopeUserAgent(_credentials) {
  return "antigravity";
}
function generateAntigravityRequestId() {
  return `agent/${Date.now()}/${crypto.randomBytes(4).toString("hex")}`;
}
function generateAntigravitySessionId() {
  const max = 18446744073709551615n;
  const target = 9000000000000000000n;
  const limit = max - max % target;
  let value;
  do {
    value = crypto.randomBytes(8).readBigUInt64BE();
  } while (value >= limit);
  return `-${(value % target).toString()}`;
}
function deriveAntigravitySessionId(accountKey) {
  const key = toNonEmptyString(accountKey);
  if (!key) return null;
  let hash = FNV_OFFSET_I64;
  for (const byte of Buffer.from(key, "utf8")) {
    hash = BigInt.asIntN(64, hash ^ BigInt(byte));
    hash = BigInt.asIntN(64, hash * FNV_PRIME_I64);
  }
  return hash.toString();
}
function getAntigravitySessionId(credentials, fallback) {
  return toNonEmptyString(fallback) || generateAntigravitySessionId();
}
export {
  deriveAntigravitySessionId,
  generateAntigravityRequestId,
  generateAntigravitySessionId,
  getAntigravityAccountKey,
  getAntigravityEnvelopeUserAgent,
  getAntigravitySessionId
};
